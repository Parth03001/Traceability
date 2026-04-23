"""
SQL Query definitions for Z-Stage
"""

import re


class CommonQueries:
    TEST_CONNECTION = "SELECT 1"


class DatabaseQueries:
    CHECK_DATABASE_EXISTS = (
        "SELECT 1 FROM pg_database WHERE datname = :db_name"
    )

    @staticmethod
    def get_create_database_query(db_name: str) -> str:
        """Return a safe CREATE DATABASE statement (name pre-validated)"""
        return f'CREATE DATABASE "{db_name}"'


class QueryValidator:
    @staticmethod
    def validate_identifier(name: str, label: str = "identifier") -> None:
        """
        Ensure a database identifier contains only safe characters.
        Raises ValueError for invalid names.
        """
        if not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', name):
            raise ValueError(
                f"Invalid {label} '{name}': must start with a letter and "
                "contain only letters, digits, or underscores."
            )


# ── Layout queries ────────────────────────────────────────────────────────────

class LayoutQueries:
    LIST_LAYOUTS = """
        SELECT id, name, user_id, legend_position_x, legend_position_y, text_labels, canvas_arrows, created_at, updated_at
        FROM layouts
        WHERE (:user_id IS NULL OR user_id = :user_id)
        ORDER BY created_at DESC
    """

    GET_LAYOUT = """
        SELECT id, name, user_id, legend_position_x, legend_position_y, text_labels, canvas_arrows, created_at, updated_at
        FROM layouts
        WHERE id = :layout_id
    """

    CREATE_LAYOUT = """
        INSERT INTO layouts (name, user_id, created_at, updated_at)
        VALUES (:name, :user_id, NOW(), NOW())
        RETURNING id, name, user_id, legend_position_x, legend_position_y, text_labels, canvas_arrows, created_at, updated_at
    """

    UPDATE_LAYOUT = """
        UPDATE layouts
        SET name               = COALESCE(:name, name),
            legend_position_x  = COALESCE(:legend_position_x, legend_position_x),
            legend_position_y  = COALESCE(:legend_position_y, legend_position_y),
            text_labels        = COALESCE(:text_labels, text_labels),
            canvas_arrows      = COALESCE(:canvas_arrows, canvas_arrows),
            updated_at         = NOW()
        WHERE id = :layout_id
        RETURNING id, name, user_id, legend_position_x, legend_position_y, text_labels, canvas_arrows, created_at, updated_at
    """

    DELETE_LAYOUT = "DELETE FROM layouts WHERE id = :layout_id"

    CHECK_EXISTS = "SELECT id FROM layouts WHERE id = :layout_id"


# ── Station box queries ───────────────────────────────────────────────────────

class StationBoxQueries:
    LIST_BY_LAYOUT = """
        SELECT id, layout_id, name, prefix, station_count, station_ids, z_labels,
               station_data, position_x, position_y, order_index, created_at, updated_at
        FROM station_boxes
        WHERE layout_id = :layout_id
        ORDER BY order_index, id
    """

    GET_BOX = """
        SELECT id, layout_id, name, prefix, station_count, station_ids, z_labels,
               station_data, position_x, position_y, order_index, created_at, updated_at
        FROM station_boxes
        WHERE id = :box_id
    """

    CREATE_BOX = """
        INSERT INTO station_boxes
            (layout_id, name, prefix, station_count, station_ids, z_labels,
             station_data, position_x, position_y, order_index, created_at, updated_at)
        VALUES
            (:layout_id, :name, :prefix, :station_count, :station_ids, :z_labels,
             :station_data, :position_x, :position_y, :order_index, NOW(), NOW())
        RETURNING id, layout_id, name, prefix, station_count, station_ids, z_labels,
                  station_data, position_x, position_y, order_index, created_at, updated_at
    """

    UPDATE_BOX = """
        UPDATE station_boxes
        SET name          = COALESCE(:name, name),
            prefix        = COALESCE(:prefix, prefix),
            station_count = COALESCE(:station_count, station_count),
            station_ids   = COALESCE(:station_ids, station_ids),
            z_labels      = COALESCE(:z_labels, z_labels),
            station_data  = COALESCE(:station_data, station_data),
            position_x    = COALESCE(:position_x, position_x),
            position_y    = COALESCE(:position_y, position_y),
            order_index   = COALESCE(:order_index, order_index),
            updated_at    = NOW()
        WHERE id = :box_id
        RETURNING id, layout_id, name, prefix, station_count, station_ids, z_labels,
                  station_data, position_x, position_y, order_index, created_at, updated_at
    """

    DELETE_BOX = "DELETE FROM station_boxes WHERE id = :box_id"

    CHECK_EXISTS = "SELECT id FROM station_boxes WHERE id = :box_id"


# ── Buyoff icon queries ───────────────────────────────────────────────────────

class BuyoffIconQueries:
    LIST_BY_LAYOUT = """
        SELECT id, layout_id, position_x, position_y, name, created_at
        FROM buyoff_icons
        WHERE layout_id = :layout_id
        ORDER BY id
    """

    GET_ICON = """
        SELECT id, layout_id, position_x, position_y, name, created_at
        FROM buyoff_icons
        WHERE id = :icon_id
    """

    CREATE_ICON = """
        INSERT INTO buyoff_icons (layout_id, position_x, position_y, name, created_at)
        VALUES (:layout_id, :position_x, :position_y, :name, NOW())
        RETURNING id, layout_id, position_x, position_y, name, created_at
    """

    UPDATE_ICON = """
        UPDATE buyoff_icons
        SET position_x = COALESCE(:position_x, position_x),
            position_y = COALESCE(:position_y, position_y),
            name       = COALESCE(:name,       name)
        WHERE id = :icon_id
        RETURNING id, layout_id, position_x, position_y, name, created_at
    """

    DELETE_ICON = "DELETE FROM buyoff_icons WHERE id = :icon_id"

    CHECK_EXISTS = "SELECT id FROM buyoff_icons WHERE id = :icon_id"


# Keep alias for any code that still uses the old name during transition
BypassIconQueries = BuyoffIconQueries


# ── Connection queries ────────────────────────────────────────────────────────

class ConnectionQueries:
    LIST_BY_LAYOUT = """
        SELECT id, layout_id, from_box_id, to_box_id, from_buyoff_id, to_buyoff_id,
               from_station_id, to_station_id, created_at
        FROM box_connections
        WHERE layout_id = :layout_id
        ORDER BY id
    """

    CREATE_CONNECTION = """
        INSERT INTO box_connections (layout_id, from_box_id, to_box_id, from_buyoff_id, to_buyoff_id,
                                     from_station_id, to_station_id, created_at)
        VALUES (:layout_id, :from_box_id, :to_box_id, :from_buyoff_id, :to_buyoff_id,
                :from_station_id, :to_station_id, NOW())
        RETURNING id, layout_id, from_box_id, to_box_id, from_buyoff_id, to_buyoff_id,
                  from_station_id, to_station_id, created_at
    """

    DELETE_CONNECTION = "DELETE FROM box_connections WHERE id = :conn_id"

    CHECK_EXISTS = "SELECT id FROM box_connections WHERE id = :conn_id"


# ── Snapshot queries (full layout sync) ───────────────────────────────────────

class SnapshotQueries:
    DELETE_CONNECTIONS = "DELETE FROM box_connections WHERE layout_id = :layout_id"
    DELETE_BUYOFF_ICONS = "DELETE FROM buyoff_icons WHERE layout_id = :layout_id"
    DELETE_STATION_BOXES = "DELETE FROM station_boxes WHERE layout_id = :layout_id"

    # Keep old name as alias
    DELETE_BYPASS_ICONS = DELETE_BUYOFF_ICONS


# ── Input record queries ───────────────────────────────────────────────────────

class InputRecordQueries:
    LIST_ALL = """
        SELECT id, user_id, layout_id, sr_no, concern_id, concern, type, root_cause, action_plan,
               target_date, closure_date, ryg, attri, comm, line, stage_no,
               z_e, attribution, part, phenomena, total_incidences,
               monthly_data, field_defect_after_cutoff, status_3m,
               created_at, updated_at
        FROM input_records
        WHERE (:user_id IS NULL OR user_id = :user_id)
          AND (:layout_id IS NULL OR layout_id = :layout_id)
        ORDER BY sr_no, id
    """

    GET_BY_ID = """
        SELECT id, user_id, layout_id, sr_no, concern_id, concern, type, root_cause, action_plan,
               target_date, closure_date, ryg, attri, comm, line, stage_no,
               z_e, attribution, part, phenomena, total_incidences,
               monthly_data, field_defect_after_cutoff, status_3m,
               created_at, updated_at
        FROM input_records
        WHERE id = :record_id
    """

    CREATE = """
        INSERT INTO input_records (
            user_id, layout_id,
            sr_no, concern_id, concern, type, root_cause, action_plan,
            target_date, closure_date, ryg, attri, comm, line, stage_no,
            z_e, attribution, part, phenomena, total_incidences,
            monthly_data, field_defect_after_cutoff, status_3m,
            created_at, updated_at
        ) VALUES (
            :user_id, :layout_id,
            :sr_no, :concern_id, :concern, :type, :root_cause, :action_plan,
            :target_date, :closure_date, :ryg, :attri, :comm, :line, :stage_no,
            :z_e, :attribution, :part, :phenomena, :total_incidences,
            :monthly_data, :field_defect_after_cutoff, :status_3m,
            NOW(), NOW()
        )
        RETURNING id, user_id, layout_id, sr_no, concern_id, concern, type, root_cause, action_plan,
                  target_date, closure_date, ryg, attri, comm, line, stage_no,
                  z_e, attribution, part, phenomena, total_incidences,
                  monthly_data, field_defect_after_cutoff, status_3m,
                  created_at, updated_at
    """

    UPDATE = """
        UPDATE input_records SET
            sr_no                    = COALESCE(:sr_no, sr_no),
            concern_id               = COALESCE(:concern_id, concern_id),
            concern                  = COALESCE(:concern, concern),
            type                     = COALESCE(:type, type),
            root_cause               = COALESCE(:root_cause, root_cause),
            action_plan              = COALESCE(:action_plan, action_plan),
            target_date              = COALESCE(:target_date, target_date),
            closure_date             = COALESCE(:closure_date, closure_date),
            ryg                      = COALESCE(:ryg, ryg),
            attri                    = COALESCE(:attri, attri),
            comm                     = COALESCE(:comm, comm),
            line                     = COALESCE(:line, line),
            stage_no                 = COALESCE(:stage_no, stage_no),
            z_e                      = COALESCE(:z_e, z_e),
            attribution              = COALESCE(:attribution, attribution),
            part                     = COALESCE(:part, part),
            phenomena                = COALESCE(:phenomena, phenomena),
            total_incidences         = COALESCE(:total_incidences, total_incidences),
            monthly_data             = COALESCE(:monthly_data, monthly_data),
            field_defect_after_cutoff = COALESCE(:field_defect_after_cutoff, field_defect_after_cutoff),
            status_3m                = COALESCE(:status_3m, status_3m),
            updated_at               = NOW()
        WHERE id = :record_id
        RETURNING id, user_id, layout_id, sr_no, concern_id, concern, type, root_cause, action_plan,
                  target_date, closure_date, ryg, attri, comm, line, stage_no,
                  z_e, attribution, part, phenomena, total_incidences,
                  monthly_data, field_defect_after_cutoff, status_3m,
                  created_at, updated_at
    """

    DELETE_ALL = "DELETE FROM input_records WHERE (:user_id IS NULL OR user_id = :user_id) AND (:layout_id IS NULL OR layout_id = :layout_id)"

    CHECK_EXISTS = "SELECT id FROM input_records WHERE id = :record_id"

    GET_MAX_SR_NO = """
        SELECT COALESCE(MAX(sr_no), 0) AS max_sr_no
        FROM input_records
        WHERE (:user_id IS NULL OR user_id = :user_id)
          AND (:layout_id IS NULL OR layout_id = :layout_id)
    """


# ── Layered audit queries ──────────────────────────────────────────────────────

class LayeredAuditQueries:
    LIST_ALL = """
        SELECT id, user_id, layout_id, model, sr_no, date_col, station_id,
               workstation, auditor, ncs, action_plan, four_m, responsibility,
               target_date, status, created_at, updated_at
        FROM layered_audit
        WHERE (:user_id IS NULL OR user_id = :user_id)
          AND (:layout_id IS NULL OR layout_id = :layout_id)
        ORDER BY id
    """

    CREATE = """
        INSERT INTO layered_audit (
            user_id, layout_id, model, sr_no, date_col, station_id,
            workstation, auditor, ncs, action_plan, four_m, responsibility,
            target_date, status, created_at, updated_at
        ) VALUES (
            :user_id, :layout_id, :model, :sr_no, :date_col, :station_id,
            :workstation, :auditor, :ncs, :action_plan, :four_m, :responsibility,
            :target_date, :status, NOW(), NOW()
        )
        RETURNING id, user_id, layout_id, model, sr_no, date_col, station_id,
                  workstation, auditor, ncs, action_plan, four_m, responsibility,
                  target_date, status, created_at, updated_at
    """

    UPDATE = """
        UPDATE layered_audit SET
            model          = COALESCE(:model,          model),
            sr_no          = COALESCE(:sr_no,          sr_no),
            date_col       = COALESCE(:date_col,       date_col),
            station_id     = COALESCE(:station_id,     station_id),
            workstation    = COALESCE(:workstation,    workstation),
            auditor        = COALESCE(:auditor,        auditor),
            ncs            = COALESCE(:ncs,            ncs),
            action_plan    = COALESCE(:action_plan,    action_plan),
            four_m         = COALESCE(:four_m,         four_m),
            responsibility = COALESCE(:responsibility, responsibility),
            target_date    = COALESCE(:target_date,    target_date),
            status         = COALESCE(:status,         status),
            updated_at     = NOW()
        WHERE id = :record_id
        RETURNING id, user_id, layout_id, model, sr_no, date_col, station_id,
                  workstation, auditor, ncs, action_plan, four_m, responsibility,
                  target_date, status, created_at, updated_at
    """

    CHECK_EXISTS = "SELECT id FROM layered_audit WHERE id = :record_id"

    DELETE_ALL = """
        DELETE FROM layered_audit
        WHERE (:user_id IS NULL OR user_id = :user_id)
          AND (:layout_id IS NULL OR layout_id = :layout_id)
    """


# ── Layered audit adherence queries ───────────────────────────────────────────

class LayeredAuditAdherenceQueries:
    LIST_ALL = """
        SELECT id, user_id, layout_id, stage_no, stage_name, auditor, audit_date,
               created_at, updated_at
        FROM layered_audit_adherence
        WHERE (:user_id IS NULL OR user_id = :user_id)
          AND (:layout_id IS NULL OR layout_id = :layout_id)
        ORDER BY id
    """

    CREATE = """
        INSERT INTO layered_audit_adherence (
            user_id, layout_id, stage_no, stage_name, auditor, audit_date,
            created_at, updated_at
        ) VALUES (
            :user_id, :layout_id, :stage_no, :stage_name, :auditor, :audit_date,
            NOW(), NOW()
        )
        RETURNING id, user_id, layout_id, stage_no, stage_name, auditor, audit_date,
                  created_at, updated_at
    """

    UPDATE = """
        UPDATE layered_audit_adherence SET
            stage_no   = COALESCE(:stage_no,   stage_no),
            stage_name = COALESCE(:stage_name, stage_name),
            auditor    = COALESCE(:auditor,    auditor),
            audit_date = COALESCE(:audit_date, audit_date),
            updated_at = NOW()
        WHERE id = :record_id
        RETURNING id, user_id, layout_id, stage_no, stage_name, auditor, audit_date,
                  created_at, updated_at
    """

    CHECK_EXISTS = "SELECT id FROM layered_audit_adherence WHERE id = :record_id"

    DELETE_ALL = """
        DELETE FROM layered_audit_adherence
        WHERE (:user_id IS NULL OR user_id = :user_id)
          AND (:layout_id IS NULL OR layout_id = :layout_id)
    """


# ── Station document queries ───────────────────────────────────────────────────

class StationDocumentQueries:
    LIST_BY_STATION = """
        SELECT id, user_id, layout_id, station_id, concern_id, doc_type, filename,
               file_path, file_size, mime_type, created_at
        FROM station_documents
        WHERE (:user_id IS NULL OR user_id = :user_id)
          AND (:layout_id IS NULL OR layout_id = :layout_id)
          AND station_id = :station_id
        ORDER BY concern_id, doc_type, id
    """

    LIST_BY_LAYOUT = """
        SELECT id, user_id, layout_id, station_id, concern_id, doc_type, filename,
               file_path, file_size, mime_type, created_at
        FROM station_documents
        WHERE (:user_id IS NULL OR user_id = :user_id)
          AND (:layout_id IS NULL OR layout_id = :layout_id)
        ORDER BY station_id, concern_id, doc_type, id
    """

    CREATE = """
        INSERT INTO station_documents
            (user_id, layout_id, station_id, concern_id, doc_type, filename,
             file_path, file_size, mime_type, created_at, updated_at)
        VALUES
            (:user_id, :layout_id, :station_id, :concern_id, :doc_type, :filename,
             :file_path, :file_size, :mime_type, NOW(), NOW())
        RETURNING id, user_id, layout_id, station_id, concern_id, doc_type, filename,
                  file_path, file_size, mime_type, created_at
    """

    GET_BY_ID = """
        SELECT id, user_id, layout_id, station_id, concern_id, doc_type, filename,
               file_path, file_size, mime_type, created_at
        FROM station_documents
        WHERE id = :doc_id
    """

    DELETE = "DELETE FROM station_documents WHERE id = :doc_id"

    CHECK_EXISTS = "SELECT id FROM station_documents WHERE id = :doc_id"
