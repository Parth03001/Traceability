"""
PartLabeler SQL Queries
Queries for managing images and labels in PartLabeler
"""

class PartLabelerQueries:
    INSERT_IMAGE = """
        INSERT INTO images (filename, display_name, user_id)
        VALUES (:filename, :display_name, :user_id)
        RETURNING id
    """

    GET_ALL_IMAGES = """
        SELECT id, filename, created_at, display_name
        FROM images
        WHERE user_id = :user_id
        ORDER BY created_at DESC
    """

    DELETE_IMAGE = """
        DELETE FROM images
        WHERE id = :id AND user_id = :user_id
    """

    INSERT_LABEL = """
        INSERT INTO labels (image_id, part_name, description, part_number, failure_count, report_month, x_coord, y_coord, user_id)
        VALUES (:image_id, :part_name, :description, :part_number, :failure_count, :report_month, :x_coord, :y_coord, :user_id)
        RETURNING id
    """

    DELETE_LABEL = """
        DELETE FROM labels
        WHERE id = :id AND user_id = :user_id
    """

    UPDATE_LABEL_NAME = """
        UPDATE labels
        SET part_name = :part_name
        WHERE id = :id AND user_id = :user_id
    """

    GET_LABELS_FOR_IMAGE = """
        SELECT id, image_id, part_name, description, part_number, failure_count, report_month, x_coord, y_coord
        FROM labels
        WHERE image_id = :image_id AND user_id = :user_id
    """

    GET_UNIQUE_MODELS = """
        SELECT DISTINCT base_model FROM raw_warranty_data 
        WHERE base_model IS NOT NULL AND base_model != '' AND user_id = :user_id
        ORDER BY base_model ASC
    """

    GET_UNIQUE_MIS_BUCKETS = """
        SELECT DISTINCT mis_bucket FROM raw_warranty_data 
        WHERE mis_bucket IS NOT NULL AND mis_bucket != '' AND user_id = :user_id
        ORDER BY mis_bucket ASC
    """

    GET_UNIQUE_MFG_QUARTERS = """
        SELECT DISTINCT new_manufacturing_quater FROM raw_warranty_data 
        WHERE new_manufacturing_quater IS NOT NULL AND new_manufacturing_quater != '' AND user_id = :user_id
        ORDER BY new_manufacturing_quater ASC
    """

    GET_UNIQUE_MFG_MONTHS = """
        SELECT mfg_month FROM (
            SELECT DISTINCT manufac_yr_mon AS mfg_month,
                   TO_DATE(manufac_yr_mon, 'Mon-YYYY') AS sort_key
            FROM raw_warranty_data
            WHERE manufac_yr_mon IS NOT NULL AND manufac_yr_mon != '' AND user_id = :user_id
        ) sub ORDER BY sort_key DESC
    """

    GET_MFG_DATE_RANGE = """
        SELECT 
            MIN(TO_DATE(manufac_yr_mon, 'Mon-YYYY')) as min_date,
            MAX(TO_DATE(manufac_yr_mon, 'Mon-YYYY')) as max_date
        FROM raw_warranty_data
        WHERE user_id = :user_id AND manufac_yr_mon IS NOT NULL AND manufac_yr_mon != ''
    """

    GET_REPORTING_DATE_RANGE = """
        SELECT 
            MIN(TO_DATE(claim_date, 'YYYY-MM-DD')) as min_date,
            MAX(TO_DATE(claim_date, 'YYYY-MM-DD')) as max_date
        FROM raw_warranty_data
        WHERE user_id = :user_id AND claim_date IS NOT NULL AND claim_date != ''
    """

    GET_ALL_WARRANTY_FOR_PART = """
        SELECT * FROM raw_warranty_data
        WHERE (LOWER(REPLACE(material_description, ' ', '')) LIKE :search_term
           OR LOWER(REPLACE(complaint_code_desc, ' ', '')) LIKE :search_term)
           AND (:base_model IS NULL OR base_model = ANY(:base_model))
           AND (:mis_bucket IS NULL OR mis_bucket = ANY(:mis_bucket))
           AND (:mfg_qtr IS NULL OR new_manufacturing_quater = ANY(:mfg_qtr))
           AND (:month_val IS NULL OR manufac_yr_mon = ANY(:month_val))
           AND user_id = :user_id
        ORDER BY failure_date DESC
    """

    # Warranty Record Queries (from raw_warranty_data)
    GET_WARRANTY_DATA = """
        SELECT 
            mode() WITHIN GROUP (ORDER BY material_description) as "partName", 
            manufac_yr_mon as "month", 
            COUNT(*) as "failureCount", 
            mode() WITHIN GROUP (ORDER BY COALESCE(NULLIF(complaint_code_desc, ''), dealer_verbatim)) as "description"
        FROM raw_warranty_data
        WHERE manufac_yr_mon IS NOT NULL AND manufac_yr_mon != ''
          AND (:base_model IS NULL OR base_model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR mis_bucket = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR new_manufacturing_quater = ANY(:mfg_qtr))
          AND user_id = :user_id
        GROUP BY manufac_yr_mon
        ORDER BY manufac_yr_mon DESC
    """

    SEARCH_WARRANTY_DATA = """
        SELECT 
            mode() WITHIN GROUP (ORDER BY material_description) as "partName", 
            manufac_yr_mon as "month", 
            COUNT(*) as "failureCount", 
            mode() WITHIN GROUP (ORDER BY COALESCE(NULLIF(complaint_code_desc, ''), dealer_verbatim)) as "description"
        FROM raw_warranty_data
        WHERE (LOWER(REPLACE(material_description, ' ', '')) LIKE :search_term
           OR LOWER(REPLACE(complaint_code_desc, ' ', '')) LIKE :search_term)
          AND manufac_yr_mon IS NOT NULL AND manufac_yr_mon != ''
          AND (:base_model IS NULL OR base_model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR mis_bucket = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR new_manufacturing_quater = ANY(:mfg_qtr))
          AND user_id = :user_id
        GROUP BY manufac_yr_mon
        ORDER BY manufac_yr_mon DESC
    """

    INSERT_RAW_WARRANTY = """
        INSERT INTO raw_warranty_data (
            region, zone, area_office, plant, plant_desc, commodity, group_code, group_code_desc, 
            complaint_code, complaint_code_desc, base_model, model_code, model_family, claim_type, 
            sap_claim_no, claim_desc, ac_non_ac, variant, drive_type, service_type, billing_dealer, 
            billing_dealer_name, serial_no, claim_date, failure_kms, km_hr_group, dealer_verbatim, 
            part, vender, material_description, causal_flag, jdp_city, fisyr_qrt, engine_number, 
            manufac_yr_mon, failure_date, mis_bucket, walk_home, dealer_code, claim_dealer_name, 
            ro_number, no_of_incidents, new_manufacturing_quater, vendor_manuf, user_id
        ) VALUES (
            :region, :zone, :area_office, :plant, :plant_desc, :commodity, :group_code, :group_code_desc, 
            :complaint_code, :complaint_code_desc, :base_model, :model_code, :model_family, :claim_type, 
            :sap_claim_no, :claim_desc, :ac_non_ac, :variant, :drive_type, :service_type, :billing_dealer, 
            :billing_dealer_name, :serial_no, :claim_date, :failure_kms, :km_hr_group, :dealer_verbatim, 
            :part, :vender, :material_description, :causal_flag, :jdp_city, :fisyr_qrt, :engine_number, 
            :manufac_yr_mon, :failure_date, :mis_bucket, :walk_home, :dealer_code, :claim_dealer_name, 
            :ro_number, :no_of_incidents, :new_manufacturing_quater, :vendor_manuf, :user_id
        )
    """

    GET_DASHBOARD_MFG_MONTH = """
        SELECT manufac_yr_mon as label, COUNT(*) as value
        FROM raw_warranty_data
        WHERE user_id = :user_id
          AND manufac_yr_mon IS NOT NULL AND manufac_yr_mon != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(material_description, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(complaint_code_desc, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR manufac_yr_mon = ANY(:month_val))
          AND (:base_model IS NULL OR base_model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR mis_bucket = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR new_manufacturing_quater = ANY(:mfg_qtr))
        GROUP BY manufac_yr_mon
        ORDER BY TO_DATE(manufac_yr_mon, 'Mon-YYYY') ASC
    """

    GET_DASHBOARD_REPORTING_MONTH = """
        SELECT TO_CHAR(TO_DATE(claim_date, 'YYYY-MM-DD'), 'Mon-YY') as label, COUNT(*) as value
        FROM raw_warranty_data
        WHERE user_id = :user_id AND claim_date IS NOT NULL AND claim_date != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(material_description, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(complaint_code_desc, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR manufac_yr_mon = ANY(:month_val))
          AND (:base_model IS NULL OR base_model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR mis_bucket = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR new_manufacturing_quater = ANY(:mfg_qtr))
        GROUP BY 1
        ORDER BY MIN(TO_DATE(claim_date, 'YYYY-MM-DD')) ASC
    """

    GET_DASHBOARD_KMS = """
        SELECT 
            CASE 
                WHEN CAST(NULLIF(REGEXP_REPLACE(failure_kms, '[^0-9.]', '', 'g'), '') AS FLOAT) <= 1000 THEN '0-1k'
                WHEN CAST(NULLIF(REGEXP_REPLACE(failure_kms, '[^0-9.]', '', 'g'), '') AS FLOAT) <= 2000 THEN '1k-2k'
                WHEN CAST(NULLIF(REGEXP_REPLACE(failure_kms, '[^0-9.]', '', 'g'), '') AS FLOAT) <= 5000 THEN '2k-5k'
                WHEN CAST(NULLIF(REGEXP_REPLACE(failure_kms, '[^0-9.]', '', 'g'), '') AS FLOAT) <= 10000 THEN '5k-10k'
                WHEN CAST(NULLIF(REGEXP_REPLACE(failure_kms, '[^0-9.]', '', 'g'), '') AS FLOAT) <= 20000 THEN '10k-20k'
                WHEN CAST(NULLIF(REGEXP_REPLACE(failure_kms, '[^0-9.]', '', 'g'), '') AS FLOAT) <= 30000 THEN '20k-30k'
                ELSE '30k above'
            END as label,
            COUNT(*) as value
        FROM raw_warranty_data
        WHERE user_id = :user_id AND failure_kms IS NOT NULL AND failure_kms != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(material_description, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(complaint_code_desc, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR manufac_yr_mon = ANY(:month_val))
          AND (:base_model IS NULL OR base_model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR mis_bucket = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR new_manufacturing_quater = ANY(:mfg_qtr))
        GROUP BY 1
        ORDER BY MIN(CASE 
            WHEN CAST(NULLIF(REGEXP_REPLACE(failure_kms, '[^0-9.]', '', 'g'), '') AS FLOAT) <= 1000 THEN 1
            WHEN CAST(NULLIF(REGEXP_REPLACE(failure_kms, '[^0-9.]', '', 'g'), '') AS FLOAT) <= 2000 THEN 2
            WHEN CAST(NULLIF(REGEXP_REPLACE(failure_kms, '[^0-9.]', '', 'g'), '') AS FLOAT) <= 5000 THEN 3
            WHEN CAST(NULLIF(REGEXP_REPLACE(failure_kms, '[^0-9.]', '', 'g'), '') AS FLOAT) <= 10000 THEN 4
            WHEN CAST(NULLIF(REGEXP_REPLACE(failure_kms, '[^0-9.]', '', 'g'), '') AS FLOAT) <= 20000 THEN 5
            WHEN CAST(NULLIF(REGEXP_REPLACE(failure_kms, '[^0-9.]', '', 'g'), '') AS FLOAT) <= 30000 THEN 6
            ELSE 7 END) ASC
    """

    GET_DASHBOARD_REGION = """
        SELECT region as label, COUNT(*) as value
        FROM raw_warranty_data
        WHERE user_id = :user_id AND region IS NOT NULL AND region != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(material_description, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(complaint_code_desc, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR manufac_yr_mon = ANY(:month_val))
          AND (:base_model IS NULL OR base_model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR mis_bucket = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR new_manufacturing_quater = ANY(:mfg_qtr))
        GROUP BY region
        ORDER BY value DESC
    """

    # =====================================================
    # OFFLINE RPT QUERIES
    # =====================================================

    INSERT_RAW_RPT = """
        INSERT INTO raw_rpt_data (
            date_col, mfg_month, mfg_quarter, shift, body_sr_no, vin_number, buyoff_stage,
            model, platform_group, stage_name, part, defect, part_defect, attribute_name,
            custom_attribution, offline_val, online_val, rework_status, location_name,
            defect_status, as_is_ok, shop_name, model_description, model_code,
            severity_name, domestic_export, defect_category, user_id
        ) VALUES (
            :date_col, :mfg_month, :mfg_quarter, :shift, :body_sr_no, :vin_number, :buyoff_stage,
            :model, :platform_group, :stage_name, :part, :defect, :part_defect, :attribute_name,
            :custom_attribution, :offline_val, :online_val, :rework_status, :location_name,
            :defect_status, :as_is_ok, :shop_name, :model_description, :model_code,
            :severity_name, :domestic_export, :defect_category, :user_id
        )
    """

    RPT_GET_UNIQUE_MODELS = """
        SELECT DISTINCT model FROM raw_rpt_data
        WHERE model IS NOT NULL AND model != '' AND user_id = :user_id
        ORDER BY model ASC
    """

    RPT_GET_UNIQUE_MIS = """
        SELECT DISTINCT defect_category FROM raw_rpt_data
        WHERE defect_category IS NOT NULL AND defect_category != '' AND user_id = :user_id
        ORDER BY defect_category ASC
    """

    RPT_GET_UNIQUE_MFG_QUARTERS = """
        SELECT DISTINCT mfg_quarter FROM raw_rpt_data
        WHERE mfg_quarter IS NOT NULL AND mfg_quarter != '' AND user_id = :user_id
        ORDER BY mfg_quarter ASC
    """

    RPT_GET_UNIQUE_MFG_MONTHS = """
        SELECT mfg_month FROM (
            SELECT DISTINCT mfg_month, TO_DATE(mfg_month, 'Mon-YY') AS sort_key
            FROM raw_rpt_data
            WHERE mfg_month IS NOT NULL AND mfg_month != '' AND user_id = :user_id
        ) sub ORDER BY sort_key DESC
    """

    RPT_GET_UNIQUE_BUYOFF_STAGES = """
        SELECT DISTINCT buyoff_stage FROM raw_rpt_data
        WHERE buyoff_stage IS NOT NULL AND buyoff_stage != '' AND user_id = :user_id
        ORDER BY buyoff_stage ASC
    """

    RPT_SEARCH_DATA = """
        SELECT
            mode() WITHIN GROUP (ORDER BY part_defect) as "partName",
            mfg_month as "month",
            COUNT(*) as "failureCount",
            mode() WITHIN GROUP (ORDER BY COALESCE(NULLIF(part_defect, ''), defect)) as "description"
        FROM raw_rpt_data
        WHERE LOWER(REPLACE(part_defect, ' ', '')) LIKE :search_term
          AND mfg_month IS NOT NULL AND mfg_month != ''
          AND (:base_model IS NULL OR model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR defect_category = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
          AND (:buyoff_stage IS NULL OR buyoff_stage = ANY(:buyoff_stage))
          AND (:online_offline IS NULL
               OR ('Online' = ANY(:online_offline) AND COALESCE(TRIM(online_val), '') NOT IN ('', '0', '0.0', 'false', 'no'))
               OR ('Offline' = ANY(:online_offline) AND COALESCE(TRIM(offline_val), '') NOT IN ('', '0', '0.0', 'false', 'no')))
          AND user_id = :user_id
        GROUP BY mfg_month
        ORDER BY mfg_month DESC
    """

    RPT_GET_MFG_DATE_RANGE = """
        SELECT
            MIN(TO_DATE(mfg_month, 'Mon-YY')) as min_date,
            MAX(TO_DATE(mfg_month, 'Mon-YY')) as max_date
        FROM raw_rpt_data
        WHERE user_id = :user_id AND mfg_month IS NOT NULL AND mfg_month != ''
    """

    GNOVAC_GET_MFG_DATE_RANGE = """
        SELECT
            MIN(TO_DATE(mfg_month, 'Mon-YY')) as min_date,
            MAX(TO_DATE(mfg_month, 'Mon-YY')) as max_date
        FROM raw_gnovac_data
        WHERE user_id = :user_id AND mfg_month IS NOT NULL AND mfg_month != ''
    """

    RFI_GET_MFG_DATE_RANGE = """
        SELECT
            MIN(TO_DATE(mfg_month, 'Mon-YY')) as min_date,
            MAX(TO_DATE(mfg_month, 'Mon-YY')) as max_date
        FROM raw_rfi_data
        WHERE user_id = :user_id AND mfg_month IS NOT NULL AND mfg_month != ''
    """

    ESQA_GET_MFG_DATE_RANGE = """
        SELECT
            MIN(TO_DATE(mfg_month, 'Mon-YY')) as min_date,
            MAX(TO_DATE(mfg_month, 'Mon-YY')) as max_date
        FROM raw_esqa_data
        WHERE user_id = :user_id AND mfg_month IS NOT NULL AND mfg_month != ''
    """

    RPT_GET_DASHBOARD_MFG_MONTH = """
        SELECT mfg_month as label, COUNT(*) as value
        FROM raw_rpt_data
        WHERE user_id = :user_id AND mfg_month IS NOT NULL AND mfg_month != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_defect, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR defect_category = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
          AND (:buyoff_stage IS NULL OR buyoff_stage = ANY(:buyoff_stage))
          AND (:online_offline IS NULL
               OR ('Online' = ANY(:online_offline) AND COALESCE(TRIM(online_val), '') NOT IN ('', '0', '0.0', 'false', 'no'))
               OR ('Offline' = ANY(:online_offline) AND COALESCE(TRIM(offline_val), '') NOT IN ('', '0', '0.0', 'false', 'no')))
        GROUP BY mfg_month
        ORDER BY mfg_month ASC
    """

    RPT_GET_DASHBOARD_REPORTING_MONTH = """
        SELECT COALESCE(NULLIF(TRIM(attribute_name), ''), 'Unknown') as label, COUNT(*) as value
        FROM raw_rpt_data
        WHERE user_id = :user_id
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_defect, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR defect_category = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
          AND (:buyoff_stage IS NULL OR buyoff_stage = ANY(:buyoff_stage))
          AND (:online_offline IS NULL
               OR ('Online' = ANY(:online_offline) AND COALESCE(TRIM(online_val), '') NOT IN ('', '0', '0.0', 'false', 'no'))
               OR ('Offline' = ANY(:online_offline) AND COALESCE(TRIM(offline_val), '') NOT IN ('', '0', '0.0', 'false', 'no')))
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 15
    """

    RPT_GET_DASHBOARD_SHIFT = """
        SELECT COALESCE(NULLIF(TRIM(shift), ''), 'Unknown') as label, COUNT(*) as value
        FROM raw_rpt_data
        WHERE user_id = :user_id AND shift IS NOT NULL AND shift != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_defect, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR defect_category = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
          AND (:buyoff_stage IS NULL OR buyoff_stage = ANY(:buyoff_stage))
          AND (:online_offline IS NULL
               OR ('Online' = ANY(:online_offline) AND COALESCE(TRIM(online_val), '') NOT IN ('', '0', '0.0', 'false', 'no'))
               OR ('Offline' = ANY(:online_offline) AND COALESCE(TRIM(offline_val), '') NOT IN ('', '0', '0.0', 'false', 'no')))
        GROUP BY 1
        ORDER BY value DESC
    """

    RPT_GET_DASHBOARD_LOCATION = """
        SELECT COALESCE(NULLIF(TRIM(location_name), ''), 'Unknown') as label, COUNT(*) as value
        FROM raw_rpt_data
        WHERE user_id = :user_id AND location_name IS NOT NULL AND location_name != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_defect, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR defect_category = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
          AND (:buyoff_stage IS NULL OR buyoff_stage = ANY(:buyoff_stage))
          AND (:online_offline IS NULL
               OR ('Online' = ANY(:online_offline) AND COALESCE(TRIM(online_val), '') NOT IN ('', '0', '0.0', 'false', 'no'))
               OR ('Offline' = ANY(:online_offline) AND COALESCE(TRIM(offline_val), '') NOT IN ('', '0', '0.0', 'false', 'no')))
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 15
    """

    # =====================================================
    # GNOVAC QUERIES
    # =====================================================

    INSERT_RAW_GNOVAC = """
        INSERT INTO raw_gnovac_data (
            audit_date, mfg_month, mfg_quarter, vin_no, plant_name, model_code,
            variant_name, fuel_type, build_phase_name, body_no, part_name, defect_name,
            location_name, concern_type_name, pointer, attribution, four_m,
            four_m_analysis_name, root_cause, ica, pca, responsibility, target_date,
            status, frequency, new_and_repeat, remark, user_id
        ) VALUES (
            :audit_date, :mfg_month, :mfg_quarter, :vin_no, :plant_name, :model_code,
            :variant_name, :fuel_type, :build_phase_name, :body_no, :part_name, :defect_name,
            :location_name, :concern_type_name, :pointer, :attribution, :four_m,
            :four_m_analysis_name, :root_cause, :ica, :pca, :responsibility, :target_date,
            :status, :frequency, :new_and_repeat, :remark, :user_id
        )
    """

    GNOVAC_GET_UNIQUE_MODELS = """
        SELECT DISTINCT model_code FROM raw_gnovac_data
        WHERE model_code IS NOT NULL AND model_code != '' AND user_id = :user_id
        ORDER BY model_code ASC
    """

    GNOVAC_GET_UNIQUE_MIS = """
        SELECT DISTINCT pointer FROM raw_gnovac_data
        WHERE pointer IS NOT NULL AND pointer != '' AND user_id = :user_id
        ORDER BY pointer ASC
    """

    GNOVAC_GET_UNIQUE_MFG_QUARTERS = """
        SELECT DISTINCT mfg_quarter FROM raw_gnovac_data
        WHERE mfg_quarter IS NOT NULL AND mfg_quarter != '' AND user_id = :user_id
        ORDER BY mfg_quarter ASC
    """

    GNOVAC_GET_UNIQUE_MFG_MONTHS = """
        SELECT mfg_month FROM (
            SELECT DISTINCT mfg_month, TO_DATE(mfg_month, 'Mon-YY') AS sort_key
            FROM raw_gnovac_data
            WHERE mfg_month IS NOT NULL AND mfg_month != '' AND user_id = :user_id
        ) sub ORDER BY sort_key DESC
    """

    GNOVAC_SEARCH_DATA = """
        SELECT
            mode() WITHIN GROUP (ORDER BY part_name) as "partName",
            mfg_month as "month",
            COUNT(*) as "failureCount",
            mode() WITHIN GROUP (ORDER BY COALESCE(NULLIF(defect_name, ''), part_name)) as "description"
        FROM raw_gnovac_data
        WHERE (LOWER(REPLACE(part_name, ' ', '')) LIKE :search_term
            OR LOWER(REPLACE(defect_name, ' ', '')) LIKE :search_term)
          AND mfg_month IS NOT NULL AND mfg_month != ''
          AND (:base_model IS NULL OR model_code = ANY(:base_model))
          AND (:mis_bucket IS NULL OR pointer = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
          AND user_id = :user_id
        GROUP BY mfg_month
        ORDER BY mfg_month DESC
    """

    GNOVAC_GET_DASHBOARD_MFG_MONTH = """
        SELECT mfg_month as label, COUNT(*) as value
        FROM raw_gnovac_data
        WHERE user_id = :user_id AND mfg_month IS NOT NULL AND mfg_month != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_name, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(defect_name, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR model_code = ANY(:base_model))
          AND (:mis_bucket IS NULL OR pointer = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
        GROUP BY mfg_month
        ORDER BY mfg_month ASC
    """

    GNOVAC_GET_DASHBOARD_REPORTING_MONTH = """
        SELECT COALESCE(NULLIF(TRIM(attribution), ''), 'Unknown') as label, COUNT(*) as value
        FROM raw_gnovac_data
        WHERE user_id = :user_id
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_name, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(defect_name, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR model_code = ANY(:base_model))
          AND (:mis_bucket IS NULL OR pointer = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 15
    """

    GNOVAC_GET_DASHBOARD_POINTER = """
        SELECT COALESCE(NULLIF(TRIM(pointer), ''), 'Unknown') as label, COUNT(*) as value
        FROM raw_gnovac_data
        WHERE user_id = :user_id AND pointer IS NOT NULL AND pointer != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_name, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(defect_name, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR model_code = ANY(:base_model))
          AND (:mis_bucket IS NULL OR pointer = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 15
    """

    GNOVAC_GET_DASHBOARD_LOCATION = """
        SELECT COALESCE(NULLIF(TRIM(location_name), ''), 'Unknown') as label, COUNT(*) as value
        FROM raw_gnovac_data
        WHERE user_id = :user_id AND location_name IS NOT NULL AND location_name != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_name, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(defect_name, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR model_code = ANY(:base_model))
          AND (:mis_bucket IS NULL OR pointer = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 15
    """

    # =====================================================
    # RFI QUERIES
    # =====================================================

    INSERT_RAW_RFI = """
        INSERT INTO raw_rfi_data (
            date_col, mfg_month, mfg_quarter, plant_name, vin_no, biw_no, model_name,
            variant, fuel, drive_name, build_phase_name, software_v_name, color_name,
            country_name, area_name, part_name, defect_name, location_name,
            defect_type_name, severity_name, attribution_name, stage_name, root_cause,
            ica, pca, target_date, responsibility, status, category_name, analysis_name,
            action_plan_status, frequency, user_id
        ) VALUES (
            :date_col, :mfg_month, :mfg_quarter, :plant_name, :vin_no, :biw_no, :model_name,
            :variant, :fuel, :drive_name, :build_phase_name, :software_v_name, :color_name,
            :country_name, :area_name, :part_name, :defect_name, :location_name,
            :defect_type_name, :severity_name, :attribution_name, :stage_name, :root_cause,
            :ica, :pca, :target_date, :responsibility, :status, :category_name, :analysis_name,
            :action_plan_status, :frequency, :user_id
        )
    """

    RFI_GET_UNIQUE_MODELS = """
        SELECT DISTINCT model_name FROM raw_rfi_data
        WHERE model_name IS NOT NULL AND model_name != '' AND user_id = :user_id
        ORDER BY model_name ASC
    """

    RFI_GET_UNIQUE_MIS = """
        SELECT DISTINCT severity_name FROM raw_rfi_data
        WHERE severity_name IS NOT NULL AND severity_name != '' AND user_id = :user_id
        ORDER BY severity_name ASC
    """

    RFI_GET_UNIQUE_MFG_QUARTERS = """
        SELECT DISTINCT mfg_quarter FROM raw_rfi_data
        WHERE mfg_quarter IS NOT NULL AND mfg_quarter != '' AND user_id = :user_id
        ORDER BY mfg_quarter ASC
    """

    RFI_GET_UNIQUE_MFG_MONTHS = """
        SELECT mfg_month FROM (
            SELECT DISTINCT mfg_month, TO_DATE(mfg_month, 'Mon-YY') AS sort_key
            FROM raw_rfi_data
            WHERE mfg_month IS NOT NULL AND mfg_month != '' AND user_id = :user_id
        ) sub ORDER BY sort_key DESC
    """

    RFI_GET_UNIQUE_DEFECT_TYPES = """
        SELECT DISTINCT defect_type_name FROM raw_rfi_data
        WHERE defect_type_name IS NOT NULL AND defect_type_name != '' AND user_id = :user_id
        ORDER BY defect_type_name ASC
    """

    RFI_SEARCH_DATA = """
        SELECT
            mode() WITHIN GROUP (ORDER BY part_name) as "partName",
            mfg_month as "month",
            COUNT(*) as "failureCount",
            mode() WITHIN GROUP (ORDER BY COALESCE(NULLIF(defect_name, ''), part_name)) as "description"
        FROM raw_rfi_data
        WHERE (LOWER(REPLACE(part_name, ' ', '')) LIKE :search_term
            OR LOWER(REPLACE(defect_name, ' ', '')) LIKE :search_term)
          AND mfg_month IS NOT NULL AND mfg_month != ''
          AND (:base_model IS NULL OR model_name = ANY(:base_model))
          AND (:mis_bucket IS NULL OR severity_name = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
          AND (:defect_type IS NULL OR defect_type_name = ANY(:defect_type))
          AND user_id = :user_id
        GROUP BY mfg_month
        ORDER BY mfg_month DESC
    """

    RFI_GET_DASHBOARD_MFG_MONTH = """
        SELECT mfg_month as label, COUNT(*) as value
        FROM raw_rfi_data
        WHERE user_id = :user_id AND mfg_month IS NOT NULL AND mfg_month != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_name, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(defect_name, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR model_name = ANY(:base_model))
          AND (:mis_bucket IS NULL OR severity_name = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
          AND (:defect_type IS NULL OR defect_type_name = ANY(:defect_type))
        GROUP BY mfg_month
        ORDER BY mfg_month ASC
    """

    RFI_GET_DASHBOARD_REPORTING_MONTH = """
        SELECT COALESCE(NULLIF(TRIM(attribution_name), ''), 'Unknown') as label, COUNT(*) as value
        FROM raw_rfi_data
        WHERE user_id = :user_id
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_name, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(defect_name, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR model_name = ANY(:base_model))
          AND (:mis_bucket IS NULL OR severity_name = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
          AND (:defect_type IS NULL OR defect_type_name = ANY(:defect_type))
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 15
    """

    RFI_GET_DASHBOARD_SEVERITY_DEFECTTYPE = """
        SELECT COALESCE(NULLIF(TRIM(defect_type_name), ''), 'Unknown') || ' / ' || COALESCE(NULLIF(TRIM(severity_name), ''), 'Unknown') as label, COUNT(*) as value
        FROM raw_rfi_data
        WHERE user_id = :user_id
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_name, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(defect_name, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR model_name = ANY(:base_model))
          AND (:mis_bucket IS NULL OR severity_name = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
          AND (:defect_type IS NULL OR defect_type_name = ANY(:defect_type))
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 15
    """

    RFI_GET_DASHBOARD_LOCATION = """
        SELECT COALESCE(NULLIF(TRIM(area_name), ''), 'Unknown') as label, COUNT(*) as value
        FROM raw_rfi_data
        WHERE user_id = :user_id AND area_name IS NOT NULL AND area_name != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_name, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(defect_name, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR model_name = ANY(:base_model))
          AND (:mis_bucket IS NULL OR severity_name = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
          AND (:defect_type IS NULL OR defect_type_name = ANY(:defect_type))
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 15
    """

    # =====================================================
    # e-SQA QUERIES
    # =====================================================

    INSERT_RAW_ESQA = """
        INSERT INTO raw_esqa_data (
            concern_report_date, mfg_month, mfg_quarter, concern_number, pu_name,
            concern_source, part_no, part_name, vendor_code, vendor_name,
            concern_description, vehicle_model, vehicle_variant, concern_repeat,
            concern_category, concern_severity, qty_reported, commodity,
            concern_attribution, initial_analysis, sqa_officer, ica_possible,
            reason_ica_not_possible, ica_details, ica_failure, segregation_qty,
            ok_qty, rejection_qty, scrap_qty, rework_qty, deviation_qty,
            line_loss, yard_hold, esqa_entry_required, justification_esqa,
            esqa_number, esqa_posting_date, user_id
        ) VALUES (
            :concern_report_date, :mfg_month, :mfg_quarter, :concern_number, :pu_name,
            :concern_source, :part_no, :part_name, :vendor_code, :vendor_name,
            :concern_description, :vehicle_model, :vehicle_variant, :concern_repeat,
            :concern_category, :concern_severity, :qty_reported, :commodity,
            :concern_attribution, :initial_analysis, :sqa_officer, :ica_possible,
            :reason_ica_not_possible, :ica_details, :ica_failure, :segregation_qty,
            :ok_qty, :rejection_qty, :scrap_qty, :rework_qty, :deviation_qty,
            :line_loss, :yard_hold, :esqa_entry_required, :justification_esqa,
            :esqa_number, :esqa_posting_date, :user_id
        )
    """

    ESQA_GET_UNIQUE_MODELS = """
        SELECT DISTINCT vehicle_model FROM raw_esqa_data
        WHERE vehicle_model IS NOT NULL AND vehicle_model != '' AND user_id = :user_id
        ORDER BY vehicle_model ASC
    """

    ESQA_GET_UNIQUE_MIS = """
        SELECT DISTINCT concern_category FROM raw_esqa_data
        WHERE concern_category IS NOT NULL AND concern_category != '' AND user_id = :user_id
        ORDER BY concern_category ASC
    """

    ESQA_GET_UNIQUE_MFG_QUARTERS = """
        SELECT DISTINCT mfg_quarter FROM raw_esqa_data
        WHERE mfg_quarter IS NOT NULL AND mfg_quarter != '' AND user_id = :user_id
        ORDER BY mfg_quarter ASC
    """

    ESQA_GET_UNIQUE_MFG_MONTHS = """
        SELECT mfg_month FROM (
            SELECT DISTINCT mfg_month, TO_DATE(mfg_month, 'Mon-YY') AS sort_key
            FROM raw_esqa_data
            WHERE mfg_month IS NOT NULL AND mfg_month != '' AND user_id = :user_id
        ) sub ORDER BY sort_key DESC
    """

    ESQA_SEARCH_DATA = """
        SELECT
            mode() WITHIN GROUP (ORDER BY part_name) as "partName",
            mfg_month as "month",
            COUNT(*) as "failureCount",
            mode() WITHIN GROUP (ORDER BY COALESCE(NULLIF(concern_description, ''), part_name)) as "description"
        FROM raw_esqa_data
        WHERE (LOWER(REPLACE(part_name, ' ', '')) LIKE :search_term
            OR LOWER(REPLACE(concern_description, ' ', '')) LIKE :search_term)
          AND mfg_month IS NOT NULL AND mfg_month != ''
          AND (:base_model IS NULL OR vehicle_model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR concern_category = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
          AND user_id = :user_id
        GROUP BY mfg_month
        ORDER BY mfg_month DESC
    """

    ESQA_GET_DASHBOARD_MFG_MONTH = """
        SELECT mfg_month as label, COUNT(*) as value
        FROM raw_esqa_data
        WHERE user_id = :user_id AND mfg_month IS NOT NULL AND mfg_month != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_name, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(concern_description, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR vehicle_model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR concern_category = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
        GROUP BY mfg_month
        ORDER BY mfg_month ASC
    """

    ESQA_GET_DASHBOARD_REPORTING_MONTH = """
        SELECT COALESCE(NULLIF(TRIM(commodity), ''), 'Unknown') as label, COUNT(*) as value
        FROM raw_esqa_data
        WHERE user_id = :user_id
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_name, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(concern_description, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR vehicle_model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR concern_category = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 15
    """

    ESQA_GET_DASHBOARD_CONCERN_SOURCE = """
        SELECT COALESCE(NULLIF(TRIM(concern_source), ''), 'Unknown') as label, COUNT(*) as value
        FROM raw_esqa_data
        WHERE user_id = :user_id AND concern_source IS NOT NULL AND concern_source != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_name, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(concern_description, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR vehicle_model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR concern_category = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 15
    """

    ESQA_GET_DASHBOARD_LOCATION = """
        SELECT COALESCE(NULLIF(TRIM(concern_severity), ''), 'Unknown') as label, COUNT(*) as value
        FROM raw_esqa_data
        WHERE user_id = :user_id AND concern_severity IS NOT NULL AND concern_severity != ''
          AND (:search_terms IS NULL OR LOWER(REPLACE(part_name, ' ', '')) LIKE ANY(:search_terms) OR LOWER(REPLACE(concern_description, ' ', '')) LIKE ANY(:search_terms))
          AND (:month_val IS NULL OR mfg_month = ANY(:month_val))
          AND (:base_model IS NULL OR vehicle_model = ANY(:base_model))
          AND (:mis_bucket IS NULL OR concern_category = ANY(:mis_bucket))
          AND (:mfg_qtr IS NULL OR mfg_quarter = ANY(:mfg_qtr))
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 15
    """
