-- Sample business database schema
CREATE DATABASE IF NOT EXISTS business_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE business_db;

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;

CREATE TABLE products (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120)   NOT NULL,
  category        VARCHAR(60)    NOT NULL,
  price           DECIMAL(10,2)  NOT NULL,
  stock           INT            NOT NULL DEFAULT 0,
  critical_stock  INT            NOT NULL DEFAULT 10
);

CREATE TABLE orders (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  customer    VARCHAR(120)   NOT NULL,
  amount      DECIMAL(12,2)  NOT NULL,
  status      ENUM('completed','processing','cancelled') NOT NULL DEFAULT 'completed',
  created_at  DATETIME       NOT NULL,
  INDEX idx_created_at (created_at)
);

CREATE TABLE order_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT            NOT NULL,
  product_id  INT            NOT NULL,
  quantity    INT            NOT NULL,
  unit_price  DECIMAL(10,2)  NOT NULL,
  FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
