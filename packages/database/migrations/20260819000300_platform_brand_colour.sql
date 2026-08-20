-- A platform's brand colour belongs in the catalogue, not in a component.
--
-- The picker needs to show iFood as red and 99 as yellow so a driver finds
-- their app by colour rather than by reading twelve labels. That colour is
-- data about the platform, exactly like its name and its logo: it changes when
-- the platform rebrands, and changing it is then a row update rather than a
-- release. Keeping the table in the app also breaks the design system's rule
-- that a raw hex in a component is a bug, which CI enforces.
--
-- It is deliberately nullable. A platform with no colour renders a neutral
-- tile, which is correct rather than a guess.

alter table platforms
  add column if not exists brand_color text
  check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$');

update platforms set brand_color = v.colour
from (values
  ('uber',          '#0B0B0B'),
  ('99',            '#FFD400'),
  ('indrive',       '#C1F11D'),
  ('ifood',         '#EA1D2C'),
  ('rappi',         '#FF441F'),
  ('lalamove',      '#F16622'),
  ('loggi',         '#00C2A8'),
  ('amazon',        '#FF9900'),
  ('mercado-livre', '#FFE600'),
  ('shopee',        '#EE4D2D'),
  ('taxi',          '#F5B700')
) as v(slug, colour)
where platforms.slug = v.slug and platforms.brand_color is null;
