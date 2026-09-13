CREATE TABLE growth_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  portfolio_euros numeric(16,2) NOT NULL CHECK (portfolio_euros > 0)
);
CREATE TABLE growth_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  portfolio_euros numeric(16,2) NOT NULL CHECK (portfolio_euros > 0),
  percentage numeric(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  entry_price numeric(16,4) NOT NULL CHECK (entry_price > 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  stop_loss numeric(18,6) NOT NULL CHECK (stop_loss > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX growth_orders_user_idx ON growth_orders(user_id, created_at);
