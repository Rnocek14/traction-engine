
CREATE POLICY "Authenticated users can update product images"
  ON public.product_images FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete product images"
  ON public.product_images FOR DELETE
  TO authenticated USING (true);
