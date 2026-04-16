
-- P0: Purge hallucinated products (74 from old 'scraper' source)
-- These have no real URLs and were AI-invented before the SerpAPI pivot.

-- Cascade-delete dependent rows first
DELETE FROM product_unit_economics WHERE product_id IN (SELECT id FROM products WHERE discovered_via = 'scraper');
DELETE FROM product_suppliers WHERE product_id IN (SELECT id FROM products WHERE discovered_via = 'scraper');
DELETE FROM product_links WHERE product_id IN (SELECT id FROM products WHERE discovered_via = 'scraper');
DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE discovered_via = 'scraper');
DELETE FROM product_analysis WHERE product_id IN (SELECT id FROM products WHERE discovered_via = 'scraper');
DELETE FROM product_market_snapshots WHERE product_id IN (SELECT id FROM products WHERE discovered_via = 'scraper');
DELETE FROM product_decisions WHERE product_id IN (SELECT id FROM products WHERE discovered_via = 'scraper');
DELETE FROM product_conversions WHERE product_id IN (SELECT id FROM products WHERE discovered_via = 'scraper');
DELETE FROM content_ideas WHERE product_id IN (SELECT id FROM products WHERE discovered_via = 'scraper');

-- Allow DELETE on products (currently blocked by RLS) for cleanup
CREATE POLICY "products_delete_authenticated" ON products FOR DELETE TO authenticated USING (true);

-- Now purge the hallucinated products
DELETE FROM products WHERE discovered_via = 'scraper';
