-- More of the cars and motorcycles people actually drive for a living.
--
-- The catalogue shipped with 16 makes and 51 models, which is enough to prove
-- the picker works and not enough for a driver to find their own vehicle. A
-- driver who cannot find their bike gives up on the vehicle screen, and every
-- cost-per-kilometre number downstream depends on that screen.
--
-- Everything here is idempotent: the same file can run twice.

insert into vehicle_makes (name) values
  ('Caoa Chery'), ('Kia'), ('Mitsubishi'), ('Jeep'), ('GWM'), ('Suzuki'),
  ('Kawasaki'), ('Dafra'), ('Royal Enfield'), ('Mottu')
on conflict (name) do nothing;

-- Cars ----------------------------------------------------------------------
insert into vehicle_models (make_id, name, vehicle_type)
select m.id, v.model, 'car'::vehicle_type
from (values
  ('Chevrolet','Onix'), ('Chevrolet','Onix Plus'), ('Chevrolet','Prisma'),
  ('Chevrolet','Cobalt'), ('Chevrolet','Spin'), ('Chevrolet','Joy'),
  ('Chevrolet','Celta'), ('Chevrolet','Classic'), ('Chevrolet','Cruze'),
  ('Chevrolet','Tracker'), ('Chevrolet','Montana'),
  ('Fiat','Argo'), ('Fiat','Cronos'), ('Fiat','Mobi'), ('Fiat','Uno'),
  ('Fiat','Palio'), ('Fiat','Siena'), ('Fiat','Grand Siena'), ('Fiat','Strada'),
  ('Fiat','Toro'), ('Fiat','Punto'), ('Fiat','Idea'),
  ('Volkswagen','Gol'), ('Volkswagen','Voyage'), ('Volkswagen','Polo'),
  ('Volkswagen','Virtus'), ('Volkswagen','Fox'), ('Volkswagen','Saveiro'),
  ('Volkswagen','T-Cross'), ('Volkswagen','Jetta'), ('Volkswagen','Up'),
  ('Renault','Kwid'), ('Renault','Sandero'), ('Renault','Logan'),
  ('Renault','Duster'), ('Renault','Stepway'), ('Renault','Captur'),
  ('Renault','Oroch'),
  ('Hyundai','HB20'), ('Hyundai','HB20S'), ('Hyundai','Creta'),
  ('Hyundai','Tucson'), ('Hyundai','i30'),
  ('Toyota','Etios'), ('Toyota','Etios Sedan'), ('Toyota','Yaris'),
  ('Toyota','Yaris Sedan'), ('Toyota','Corolla'), ('Toyota','Corolla Cross'),
  ('Toyota','Hilux'),
  ('Honda','Fit'), ('Honda','City'), ('Honda','Civic'), ('Honda','HR-V'),
  ('Honda','WR-V'),
  ('Nissan','March'), ('Nissan','Versa'), ('Nissan','Kicks'), ('Nissan','Sentra'),
  ('Ford','Ka'), ('Ford','Ka Sedan'), ('Ford','Fiesta'), ('Ford','EcoSport'),
  ('Ford','Focus'),
  ('Peugeot','208'), ('Peugeot','2008'), ('Peugeot','207'),
  ('Citroën','C3'), ('Citroën','C4 Cactus'), ('Citroën','C3 Aircross'),
  ('JAC','J3'), ('JAC','T40'), ('JAC','iEV40'),
  ('BYD','Dolphin'), ('BYD','Dolphin Mini'), ('BYD','Song Plus'),
  ('BYD','Seal'), ('BYD','Yuan Plus'),
  ('Caoa Chery','Tiggo 5X'), ('Caoa Chery','Tiggo 7'), ('Caoa Chery','Arrizo 6'),
  ('Caoa Chery','QQ'),
  ('Kia','Picanto'), ('Kia','Rio'), ('Kia','Cerato'), ('Kia','Sportage'),
  ('Mitsubishi','L200'), ('Mitsubishi','ASX'), ('Mitsubishi','Outlander'),
  ('Jeep','Renegade'), ('Jeep','Compass'),
  ('GWM','Haval H6'), ('GWM','Ora 03')
) as v(make, model)
join vehicle_makes m on m.name = v.make
on conflict (make_id, name) do nothing;

-- Motorcycles ---------------------------------------------------------------
insert into vehicle_models (make_id, name, vehicle_type)
select m.id, v.model, 'motorcycle'::vehicle_type
from (values
  ('Honda','CG 160 Fan'), ('Honda','CG 160 Start'), ('Honda','CG 160 Titan'),
  ('Honda','CG 160 Cargo'), ('Honda','Biz 125'), ('Honda','Biz 110i'),
  ('Honda','Pop 110i'), ('Honda','Bros 160'), ('Honda','XRE 190'),
  ('Honda','CB 300F'), ('Honda','PCX 160'), ('Honda','Elite 125'),
  ('Honda','SH 300i'), ('Honda','NXR 160'),
  ('Yamaha','Factor 150'), ('Yamaha','Factor 125'), ('Yamaha','Fazer 250'),
  ('Yamaha','Fazer 150'), ('Yamaha','Crosser 150'), ('Yamaha','YBR 125'),
  ('Yamaha','NMax 160'), ('Yamaha','Neo 125'), ('Yamaha','Lander 250'),
  ('Yamaha','MT-03'),
  ('Suzuki','Burgman 125'), ('Suzuki','Yes 125'), ('Suzuki','Intruder 125'),
  ('Suzuki','GSX-S150'),
  ('Haojue','DK 150'), ('Haojue','Chopper Road 150'), ('Haojue','Master Ride 150'),
  ('Haojue','NK 150'),
  ('Shineray','XY 50Q'), ('Shineray','Jet 50'), ('Shineray','Phoenix 50'),
  ('Shineray','Worker 125'),
  ('Dafra','Apache 150'), ('Dafra','Citycom 300'), ('Dafra','Horizon 150'),
  ('Dafra','NH 190'),
  ('Kawasaki','Ninja 400'), ('Kawasaki','Z400'),
  ('Royal Enfield','Meteor 350'), ('Royal Enfield','Himalayan'),
  ('Mottu','Sport 110i'), ('Mottu','Pop 110i')
) as v(make, model)
join vehicle_makes m on m.name = v.make
on conflict (make_id, name) do nothing;
