-- ============================================
-- MVP SEED DATA - Demo Tables + Menu Items
-- ============================================

-- 4 Tables for the demo restaurant
INSERT INTO tables (table_number, qr_code) VALUES
    ('1', 'cafe-table-1'),
    ('2', 'cafe-table-2'),
    ('3', 'cafe-table-3'),
    ('4', 'cafe-table-4');

-- Menu items
INSERT INTO menu_items (name, category, price, is_available) VALUES
    ('Çay', 'İçecekler', 10.00, true),
    ('Kahve', 'İçecekler', 25.00, true),
    ('Limonata', 'İçecekler', 20.00, true),
    ('Su', 'İçecekler', 5.00, true),
    ('Tost', 'Yiyecekler', 35.00, true),
    ('Sandviç', 'Yiyecekler', 40.00, true),
    ('Burger', 'Yiyecekler', 65.00, true),
    ('Pizza', 'Yiyecekler', 75.00, true),
    ('Pasta', 'Tatlılar', 45.00, true),
    ('Dondurma', 'Tatlılar', 30.00, true);
