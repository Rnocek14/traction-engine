
UPDATE product_links
SET validation_status = 'pending',
    ai_verdict = NULL,
    ai_confidence = NULL,
    ai_reasoning = NULL,
    match_confidence = 0,
    validation_reasons = '{}',
    matched_attributes = '{}',
    mismatched_attributes = '{}',
    validation_version = NULL
WHERE link_type = 'wholesale'
  AND validation_status = 'rejected'
  AND validation_version = 'v2.0'
  AND (
    ai_reasoning LIKE '%Pack count%'
    OR (source_enrichment_status != 'enriched' AND source_title_full IS NULL)
  );
