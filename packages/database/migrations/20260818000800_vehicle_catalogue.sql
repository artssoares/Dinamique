-- ============================================================================
-- Catálogo inicial de veículos.
--
-- Modelos mais usados por motoristas de aplicativo e entregadores no Brasil.
-- O consumo é armazenado em metros por litro (10,8 km/l = 10800) e vem de
-- valores de referência — o consumo real medido do usuário sempre prevalece
-- depois que ele aceita a troca (§31).
--
-- O Admin pode editar e importar mais modelos por CSV/XLSX.
-- ============================================================================

-- Insere marca, modelo e versão de uma vez, sem duplicar nada.
create or replace function seed_vehicle(
  p_make text,
  p_model text,
  p_type vehicle_type,
  p_version text,
  p_year_from integer,
  p_engine text,
  p_fuel fuel_type,
  p_urban integer,
  p_highway integer
)
returns void
language plpgsql
as $$
declare
  v_make_id  uuid;
  v_model_id uuid;
begin
  insert into vehicle_makes (name) values (p_make)
  on conflict (name) do nothing;
  select id into v_make_id from vehicle_makes where name = p_make;

  insert into vehicle_models (make_id, name, vehicle_type)
  values (v_make_id, p_model, p_type)
  on conflict (make_id, name) do nothing;
  select id into v_model_id from vehicle_models
  where make_id = v_make_id and name = p_model;

  insert into vehicle_versions (
    model_id, name, year_from, engine, fuel_type, urban_consumption, highway_consumption
  )
  values (v_model_id, p_version, p_year_from::smallint, p_engine, p_fuel, p_urban, p_highway)
  on conflict (model_id, name, year_from) do nothing;
end;
$$;

do $$
begin
  -- ----------------------------------------------------------- carros ------
  perform seed_vehicle('Chevrolet','Onix','car','1.0 LT',2020,'1.0','gasoline',12500,15400);
  perform seed_vehicle('Chevrolet','Onix','car','1.0 Turbo',2021,'1.0 T','gasoline',11800,14900);
  perform seed_vehicle('Chevrolet','Onix Plus','car','1.0 Turbo LT',2021,'1.0 T','gasoline',11600,14700);
  perform seed_vehicle('Chevrolet','Prisma','car','1.4 LT',2018,'1.4','gasoline',10900,13600);
  perform seed_vehicle('Chevrolet','Spin','car','1.8 LT',2019,'1.8','gasoline',9200,11800);
  perform seed_vehicle('Chevrolet','Cobalt','car','1.8 LTZ',2019,'1.8','gasoline',9500,12200);

  perform seed_vehicle('Fiat','Argo','car','1.0 Drive',2020,'1.0','gasoline',12200,14800);
  perform seed_vehicle('Fiat','Cronos','car','1.3 Drive',2021,'1.3','gasoline',11400,14100);
  perform seed_vehicle('Fiat','Mobi','car','1.0 Like',2021,'1.0','gasoline',12800,15300);
  perform seed_vehicle('Fiat','Uno','car','1.0 Attractive',2018,'1.0','gasoline',12100,14600);
  perform seed_vehicle('Fiat','Siena','car','1.4 EL',2016,'1.4','gasoline',10500,13400);
  perform seed_vehicle('Fiat','Grand Siena','car','1.4 Attractive',2019,'1.4','gasoline',10700,13500);
  perform seed_vehicle('Fiat','Strada','car','1.4 Endurance',2021,'1.4','gasoline',9800,12600);

  perform seed_vehicle('Volkswagen','Gol','car','1.0 MPI',2019,'1.0','gasoline',11900,14500);
  perform seed_vehicle('Volkswagen','Voyage','car','1.6 MSI',2019,'1.6','gasoline',10300,13300);
  perform seed_vehicle('Volkswagen','Polo','car','1.0 MPI',2021,'1.0','gasoline',11700,14400);
  perform seed_vehicle('Volkswagen','Virtus','car','1.0 TSI',2021,'1.0 T','gasoline',11500,14900);
  perform seed_vehicle('Volkswagen','Saveiro','car','1.6 Robust',2020,'1.6','gasoline',9600,12500);

  perform seed_vehicle('Hyundai','HB20','car','1.0 Vision',2021,'1.0','gasoline',12300,14900);
  perform seed_vehicle('Hyundai','HB20S','car','1.0 Vision',2021,'1.0','gasoline',12100,14800);
  perform seed_vehicle('Hyundai','Creta','car','1.6 Attitude',2021,'1.6','gasoline',9700,12400);

  perform seed_vehicle('Renault','Kwid','car','1.0 Zen',2021,'1.0','gasoline',13200,15600);
  perform seed_vehicle('Renault','Sandero','car','1.0 Life',2020,'1.0','gasoline',11800,14300);
  perform seed_vehicle('Renault','Logan','car','1.0 Life',2020,'1.0','gasoline',11600,14200);
  perform seed_vehicle('Renault','Duster','car','1.6 Dynamique',2020,'1.6','gasoline',9300,11900);

  perform seed_vehicle('Toyota','Etios','car','1.5 XS',2019,'1.5','gasoline',11200,14000);
  perform seed_vehicle('Toyota','Yaris','car','1.5 XL',2021,'1.5','gasoline',11400,14200);
  perform seed_vehicle('Toyota','Corolla','car','2.0 XEi',2021,'2.0','gasoline',10100,13800);
  perform seed_vehicle('Toyota','Corolla','car','1.8 Hybrid',2021,'1.8 H','gasoline',17600,16400);

  perform seed_vehicle('Honda','Civic','car','2.0 EXL',2020,'2.0','gasoline',10300,13900);
  perform seed_vehicle('Honda','City','car','1.5 EX',2020,'1.5','gasoline',11000,13700);
  perform seed_vehicle('Honda','Fit','car','1.5 LX',2019,'1.5','gasoline',11300,13800);
  perform seed_vehicle('Honda','HR-V','car','1.8 EX',2020,'1.8','gasoline',9800,12700);

  perform seed_vehicle('Nissan','March','car','1.0 S',2019,'1.0','gasoline',11900,14400);
  perform seed_vehicle('Nissan','Versa','car','1.6 SV',2021,'1.6','gasoline',10600,13600);
  perform seed_vehicle('Nissan','Kicks','car','1.6 S',2021,'1.6','gasoline',10200,13100);

  perform seed_vehicle('Ford','Ka','car','1.0 SE',2019,'1.0','gasoline',12000,14600);
  perform seed_vehicle('Ford','Ka Sedan','car','1.5 SE',2019,'1.5','gasoline',10800,13500);

  perform seed_vehicle('Peugeot','208','car','1.6 Allure',2019,'1.6','gasoline',10400,13200);
  perform seed_vehicle('Citroën','C3','car','1.2 Live',2021,'1.2','gasoline',11500,14100);

  -- ------------------------------------------------------------ motos ------
  perform seed_vehicle('Honda','CG 160','motorcycle','Fan',2021,'160','gasoline',40000,45000);
  perform seed_vehicle('Honda','CG 160','motorcycle','Titan',2021,'160','gasoline',39000,44000);
  perform seed_vehicle('Honda','CG 160','motorcycle','Start',2021,'160','gasoline',41000,46000);
  perform seed_vehicle('Honda','Biz 125','motorcycle','ES',2021,'125','gasoline',45000,48000);
  perform seed_vehicle('Honda','Pop 110i','motorcycle','Pop',2021,'110','gasoline',50000,52000);
  perform seed_vehicle('Honda','CB 300F','motorcycle','Twister',2022,'300','gasoline',30000,34000);
  perform seed_vehicle('Honda','XRE 190','motorcycle','ABS',2021,'190','gasoline',34000,38000);
  perform seed_vehicle('Honda','PCX 150','motorcycle','DLX',2021,'150','gasoline',38000,40000);

  perform seed_vehicle('Yamaha','Factor 150','motorcycle','ED',2021,'150','gasoline',40000,44000);
  perform seed_vehicle('Yamaha','Fazer 250','motorcycle','ABS',2021,'250','gasoline',30000,34000);
  perform seed_vehicle('Yamaha','NMax 160','motorcycle','ABS',2021,'160','gasoline',37000,39000);
  perform seed_vehicle('Yamaha','Crosser 150','motorcycle','S',2021,'150','gasoline',36000,40000);
  perform seed_vehicle('Yamaha','YBR 150','motorcycle','Factor',2019,'150','gasoline',41000,45000);

  perform seed_vehicle('Shineray','Jet 50','motorcycle','Jet',2021,'50','gasoline',55000,57000);
  perform seed_vehicle('Haojue','DK 150','motorcycle','DK',2021,'150','gasoline',38000,42000);

  -- ------------------------------------------------------- elétricos -------
  -- Consumo elétrico não se mede em km/l. Fica null até existir um campo
  -- próprio para kWh/100 km, e a interface simplesmente não mostra o número.
  perform seed_vehicle('BYD','Dolphin','electric','Mini',2023,'EV','electric',null,null);
  perform seed_vehicle('Renault','Kwid E-Tech','electric','Zen',2023,'EV','electric',null,null);
  perform seed_vehicle('JAC','E-JS1','electric','E-JS1',2022,'EV','electric',null,null);
end;
$$;
