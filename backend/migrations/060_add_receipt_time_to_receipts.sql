-- Receipt time captured from the "Time" column when receipts are uploaded
-- (ReceiptHistory import). Displayed next to the receipt date.
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS receipt_time TEXT;
