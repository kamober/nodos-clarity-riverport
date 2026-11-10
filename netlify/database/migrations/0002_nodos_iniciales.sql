-- Nodos conocidos: nombre de campo y coordenadas medianas de los archivos de Clarity.
INSERT INTO stations (id, datasource_id, name, lat, lon) VALUES
  ('A4THKKHX', 'DRFHJ7854', 'Sur embarcadero', 10.98701, -74.76380),
  ('A4THH3V9', 'DBIUP5562', 'Carbon',          10.99067, -74.76632),
  ('A9VXKKWG', 'DPFRF5230', 'Bascula',         10.98711, -74.76708)
ON CONFLICT (id) DO NOTHING;
