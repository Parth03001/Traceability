import React, { useState, useRef, useEffect } from 'react';
import Sidebar from './Sidebar/Sidebar';
import LayoutPreparation from './LayoutPreparation/LayoutPreparation';
import InputData from './InputData/InputData';
import ZStageDashboard from './ZStageDashboard/ZStageDashboard';
import { layoutApi } from '../../services/api/layoutApi';
import authService from '../../services/api/authService';
import utilityLogo from '../../assests/image.png';
import './ZStage.css';

function ZStage() {
  const [activeSection, setActiveSection] = useState('layout');
  const userId = authService.getUserId();

  // ── Layout Preparation state lifted to App so Sidebar can trigger it ────────
  const [showAddBoxModal, setShowAddBoxModal] = useState(false);
  const [addBuyoffSignal, setAddBuyoffSignal] = useState(0);
  const [addTextSignal, setAddTextSignal] = useState(0);
  const [addArrowSignal, setAddArrowSignal] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [savedLayouts, setSavedLayouts] = useState([]);
  const [activeLayoutId, setActiveLayoutId] = useState(null); // currently loaded layout
  const [layoutSaveSignal, setLayoutSaveSignal] = useState(0);

  const saveHandlerRef = useRef(null);
  const loadHandlerRef = useRef(null);
  const copyHandlerRef = useRef(null);

  const refreshLayouts = () =>
    layoutApi.getLayouts(userId)
      .then((res) => setSavedLayouts(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});

  useEffect(() => { refreshLayouts(); }, [userId]); // eslint-disable-line

  const handleSaveLayout = async () => {
    if (!saveHandlerRef.current) return;
    setIsSaving(true);
    const ok = await saveHandlerRef.current();
    setIsSaving(false);
    if (ok) refreshLayouts();
  };

  const handleLoadLayout = async (id) => {
    if (loadHandlerRef.current) {
      await loadHandlerRef.current(id);
      setActiveLayoutId(id);
    }
  };

  // Copy current canvas as new layout
  const handleCopyLayout = async () => {
    if (!copyHandlerRef.current) return;
    const newId = await copyHandlerRef.current();
    if (newId) {
      setActiveLayoutId(newId);
      refreshLayouts();
    }
  };

  // Duplicate any saved layout by ID (from sidebar menu)
  const handleDuplicateLayout = async (id) => {
    try {
      const res = await layoutApi.getLayout(id);
      const src = res.data;
      const payload = {
        name: `Copy of ${src.name}`,
        boxes: (src.station_boxes || []).map((b) => ({
          local_id: `dup-${b.id}`,
          name: b.name,
          prefix: b.station_ids?.split(',')[0]?.split('-')[0] ?? 'ST',
          station_count: b.station_ids?.split(',').length ?? 0,
          station_ids: b.station_ids,
          station_data: b.station_data ?? '{}',
          position_x: b.position_x,
          position_y: b.position_y,
          order_index: b.order_index,
        })),
        buyoff_icons: (src.buyoff_icons || []).map((ic) => ({
          local_id: `dup-buyoff-${ic.id}`,
          position_x: ic.position_x,
          position_y: ic.position_y,
          name: ic.name || '',
        })),
        text_labels: src.text_labels || '[]',
        canvas_arrows: src.canvas_arrows || '[]',
        connections: (src.connections || []).map((c) => {
          const fromBase = c.from_box_id != null ? `dup-${c.from_box_id}` : `dup-buyoff-${c.from_buyoff_id}`;
          const toBase   = c.to_box_id   != null ? `dup-${c.to_box_id}`   : `dup-buyoff-${c.to_buyoff_id}`;
          const from = c.from_station_id ? `${fromBase}__${c.from_station_id}` : fromBase;
          const to   = c.to_station_id   ? `${toBase}__${c.to_station_id}`     : toBase;
          return { from_local_id: from, to_local_id: to };
        }),
      };
      await layoutApi.createSnapshot(payload, userId);
      refreshLayouts();
    } catch (err) {
      console.error('Duplicate failed:', err);
    }
  };

  // Rename a saved layout
  const handleRenameLayout = async (id, newName) => {
    try {
      await layoutApi.updateLayout(id, { name: newName });
      setSavedLayouts((prev) => prev.map((l) => l.id === id ? { ...l, name: newName } : l));
    } catch (err) {
      console.error('Rename failed:', err);
    }
  };

  // Delete a saved layout
  const handleDeleteLayout = async (id) => {
    try {
      await layoutApi.deleteLayout(id);
      setSavedLayouts((prev) => prev.filter((l) => l.id !== id));
      if (activeLayoutId === id) setActiveLayoutId(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const layoutActions = {
    onAddBox: () => setShowAddBoxModal(true),
    onAddBuyoff: () => setAddBuyoffSignal((s) => s + 1),
    onAddText: () => setAddTextSignal((s) => s + 1),
    onAddArrow: () => setAddArrowSignal((s) => s + 1),
    onSaveLayout: handleSaveLayout,
    onLoadLayout: handleLoadLayout,
    onCopyLayout: handleCopyLayout,
    onDuplicateLayout: handleDuplicateLayout,
    onRenameLayout: handleRenameLayout,
    onDeleteLayout: handleDeleteLayout,
    savedLayouts,
    activeLayoutId,
    isSaving,
  };

  return (
    <div className="zstage-app">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        layoutActions={layoutActions}
      />
      <main className="zstage-app-main">
        <div className="zstage-header">
          <img src={utilityLogo} alt="Mahindra Utility Logo" className="zstage-header-logo-right" />
        </div>
        {activeSection === 'layout' && (
          <LayoutPreparation
            showAddBoxModal={showAddBoxModal}
            onCloseAddBoxModal={() => setShowAddBoxModal(false)}
            addBuyoffSignal={addBuyoffSignal}
            addTextSignal={addTextSignal}
            addArrowSignal={addArrowSignal}
            onSaveLayout={(fn) => { saveHandlerRef.current = fn; }}
            onLoadLayout={(fn) => { loadHandlerRef.current = fn; }}
            onCopyLayout={(fn) => { copyHandlerRef.current = fn; }}
            onSaved={() => setLayoutSaveSignal((s) => s + 1)}
            savedLayouts={savedLayouts}
            userId={userId}
          />
        )}
        {activeSection === 'input' && (
          <InputData userId={userId} layouts={savedLayouts} />
        )}
        {activeSection === 'dashboard' && (
          <ZStageDashboard
            userId={userId}
            activeLayoutId={activeLayoutId}
            refreshSignal={layoutSaveSignal}
          />
        )}
      </main>
    </div>
  );
}

export default ZStage;
