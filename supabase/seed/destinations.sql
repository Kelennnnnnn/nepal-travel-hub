-- ============================================================================
-- Into Nepal — destinations seed data (Prompt 24).
--
-- Reviewed, static data — never generated at runtime. Two kinds of rows:
--   1. Nepal's 7 provinces x 77 districts (the post-2017 federal structure;
--      stable since the 2015 constitution's district boundaries). district
--      = name for these; region is left null (there is no tourism-region
--      grouping distinct from the administrative district itself).
--   2. Common named tourism destinations/regions that travelers actually
--      search for (Kathmandu, Pokhara, Everest Region, etc.), each linked
--      to its real district/province so filtering by province still works,
--      with `region` set to the destination's own common name — these are
--      the rows the traveler-facing location filter is expected to surface
--      first (ordered via sort_order, districts after).
--
-- Wired into supabase/config.toml's db.seed.sql_paths, so `supabase db
-- reset` loads this automatically for local development. Production (via
-- `supabase db push`, which does NOT run seed files) needs one manual run
-- after the first push:
--   psql "$DATABASE_URL" -f supabase/seed/destinations.sql
-- ============================================================================

-- ── Common named tourism destinations (shown first in the UI) ─────────────

insert into public.destinations (name, district, province, region, sort_order) values
  ('Kathmandu',         'Kathmandu',     'Bagmati',       'Kathmandu Valley',  1),
  ('Pokhara',           'Kaski',         'Gandaki',       'Pokhara Valley',    2),
  ('Chitwan',           'Chitwan',       'Bagmati',       'Chitwan',           3),
  ('Everest Region',    'Solukhumbu',    'Koshi',         'Everest Region',    4),
  ('Annapurna Region',  'Kaski',         'Gandaki',       'Annapurna Region',  5),
  ('Langtang',          'Rasuwa',        'Bagmati',       'Langtang',          6),
  ('Mustang',           'Mustang',       'Gandaki',       'Mustang',           7),
  ('Manaslu',           'Gorkha',        'Gandaki',       'Manaslu',           8),
  ('Lumbini',           'Rupandehi',     'Lumbini',       'Lumbini',           9)
on conflict (name, district) do nothing;

-- ── The 7 provinces x 77 districts ──────────────────────────────────────

insert into public.destinations (name, district, province, sort_order) values
  -- Koshi Province (14 districts)
  ('Bhojpur',        'Bhojpur',        'Koshi', 100),
  ('Dhankuta',        'Dhankuta',        'Koshi', 101),
  ('Ilam',             'Ilam',             'Koshi', 102),
  ('Jhapa',            'Jhapa',            'Koshi', 103),
  ('Khotang',          'Khotang',          'Koshi', 104),
  ('Morang',           'Morang',           'Koshi', 105),
  ('Okhaldhunga',      'Okhaldhunga',      'Koshi', 106),
  ('Panchthar',        'Panchthar',        'Koshi', 107),
  ('Sankhuwasabha',    'Sankhuwasabha',    'Koshi', 108),
  ('Solukhumbu',       'Solukhumbu',       'Koshi', 109),
  ('Sunsari',          'Sunsari',          'Koshi', 110),
  ('Taplejung',        'Taplejung',        'Koshi', 111),
  ('Terhathum',        'Terhathum',        'Koshi', 112),
  ('Udayapur',         'Udayapur',         'Koshi', 113),

  -- Madhesh Province (8 districts)
  ('Bara',             'Bara',             'Madhesh', 120),
  ('Dhanusha',         'Dhanusha',         'Madhesh', 121),
  ('Mahottari',        'Mahottari',        'Madhesh', 122),
  ('Parsa',            'Parsa',            'Madhesh', 123),
  ('Rautahat',         'Rautahat',         'Madhesh', 124),
  ('Saptari',          'Saptari',          'Madhesh', 125),
  ('Sarlahi',          'Sarlahi',          'Madhesh', 126),
  ('Siraha',           'Siraha',           'Madhesh', 127),

  -- Bagmati Province (13 districts — Chitwan and Kathmandu are already
  -- covered by the common-destinations block above, so not repeated here)
  ('Bhaktapur',        'Bhaktapur',        'Bagmati', 140),
  ('Dhading',          'Dhading',          'Bagmati', 142),
  ('Dolakha',          'Dolakha',          'Bagmati', 143),
  ('Kavrepalanchok',   'Kavrepalanchok',   'Bagmati', 145),
  ('Lalitpur',         'Lalitpur',         'Bagmati', 146),
  ('Makwanpur',        'Makwanpur',        'Bagmati', 147),
  ('Nuwakot',          'Nuwakot',          'Bagmati', 148),
  ('Ramechhap',        'Ramechhap',        'Bagmati', 149),
  ('Sindhuli',         'Sindhuli',         'Bagmati', 151),
  ('Sindhupalchok',    'Sindhupalchok',    'Bagmati', 152),

  -- Gandaki Province (11 districts — Gorkha, Kaski, Mustang already
  -- covered by the common-destinations block above)
  ('Baglung',          'Baglung',          'Gandaki', 160),
  ('Lamjung',          'Lamjung',          'Gandaki', 163),
  ('Manang',           'Manang',           'Gandaki', 164),
  ('Myagdi',           'Myagdi',           'Gandaki', 166),
  ('Nawalpur',         'Nawalpur',         'Gandaki', 167),
  ('Parbat',           'Parbat',           'Gandaki', 168),
  ('Syangja',          'Syangja',          'Gandaki', 169),
  ('Tanahun',          'Tanahun',          'Gandaki', 170),

  -- Lumbini Province (12 districts — Rupandehi already covered above)
  ('Arghakhanchi',     'Arghakhanchi',     'Lumbini', 180),
  ('Banke',            'Banke',            'Lumbini', 181),
  ('Bardiya',          'Bardiya',          'Lumbini', 182),
  ('Dang',             'Dang',             'Lumbini', 183),
  ('Parasi',           'Parasi',           'Lumbini', 184),
  ('Gulmi',            'Gulmi',            'Lumbini', 185),
  ('Kapilvastu',       'Kapilvastu',       'Lumbini', 186),
  ('Palpa',            'Palpa',            'Lumbini', 187),
  ('Pyuthan',          'Pyuthan',          'Lumbini', 188),
  ('Rolpa',            'Rolpa',            'Lumbini', 189),
  ('Rukum East',       'Rukum East',       'Lumbini', 190),

  -- Karnali Province (10 districts)
  ('Dailekh',          'Dailekh',          'Karnali', 200),
  ('Dolpa',            'Dolpa',            'Karnali', 201),
  ('Humla',            'Humla',            'Karnali', 202),
  ('Jajarkot',         'Jajarkot',         'Karnali', 203),
  ('Jumla',            'Jumla',            'Karnali', 204),
  ('Kalikot',          'Kalikot',          'Karnali', 205),
  ('Mugu',             'Mugu',             'Karnali', 206),
  ('Rukum West',       'Rukum West',       'Karnali', 207),
  ('Salyan',           'Salyan',           'Karnali', 208),
  ('Surkhet',          'Surkhet',          'Karnali', 209),

  -- Sudurpaschim Province (9 districts)
  ('Achham',           'Achham',           'Sudurpaschim', 220),
  ('Baitadi',          'Baitadi',          'Sudurpaschim', 221),
  ('Bajhang',          'Bajhang',          'Sudurpaschim', 222),
  ('Bajura',           'Bajura',           'Sudurpaschim', 223),
  ('Dadeldhura',       'Dadeldhura',       'Sudurpaschim', 224),
  ('Darchula',         'Darchula',         'Sudurpaschim', 225),
  ('Doti',             'Doti',             'Sudurpaschim', 226),
  ('Kailali',          'Kailali',          'Sudurpaschim', 227),
  ('Kanchanpur',       'Kanchanpur',       'Sudurpaschim', 228)
on conflict (name, district) do nothing;
