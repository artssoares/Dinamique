-- ============================================================================
-- Catálogo de veículos: uma versão para cada modelo.
--
-- A ampliação anterior acrescentou marcas e modelos e parou aí. O resultado é
-- que 90 dos 144 modelos do catálogo não tinham nenhuma versão: quem escolhia
-- Volkswagen e T-Cross chegava a uma lista de versões vazia e voltava para o
-- campo livre, exatamente como quem não achava a marca.
--
-- E isso não é cosmético. A versão é o que carrega o consumo de referência, e
-- sem consumo de referência não existe custo por km estimado até o motorista
-- rodar três tanques com odômetro. Um modelo sem versão é um modelo que não
-- serve para nada.
--
-- Esta migration dá versão a todos eles, acrescenta anos e acabamentos aos que
-- já tinham uma só, e traz as motos e as bicicletas que faltavam: 225
-- versões no total.
--
-- Os nomes de modelo são exatamente os que já estão no banco. Uma versão presa
-- a um modelo com nome quase igual é uma versão que ninguém encontra.
--
-- O consumo é uma referência em metros por litro (10,8 km/l = 10800). O consumo
-- medido do próprio motorista continua prevalecendo depois que ele aceita a
-- troca (§31), e o Admin continua podendo editar e importar por CSV.
--
-- `seed_vehicle` insere marca, modelo e versão sem duplicar nada, então rodar
-- este arquivo duas vezes não muda o resultado.
-- ============================================================================

do $$
begin
  -- ---------------------------------------------------------- carros ------
  -- Chevrolet
  perform seed_vehicle('Chevrolet','Onix','car','1.0 LS',2015,'1.0','gasoline',11900,14500);
  perform seed_vehicle('Chevrolet','Onix','car','1.4 LTZ',2016,'1.4','gasoline',10400,13200);
  perform seed_vehicle('Chevrolet','Onix','car','1.0 Turbo Premier',2023,'1.0 T','gasoline',11500,14800);
  perform seed_vehicle('Chevrolet','Onix','car','1.0 LT',2024,'1.0','gasoline',12100,15200);
  perform seed_vehicle('Chevrolet','Onix Plus','car','1.0 Turbo LTZ',2023,'1.0 T','gasoline',11400,14900);
  perform seed_vehicle('Chevrolet','Onix Plus','car','1.0 Turbo Premier',2024,'1.0 T','gasoline',11300,14800);
  perform seed_vehicle('Chevrolet','Prisma','car','1.0 LT',2015,'1.0','gasoline',11600,14200);
  perform seed_vehicle('Chevrolet','Prisma','car','1.4 LTZ',2019,'1.4','gasoline',10800,13500);
  perform seed_vehicle('Chevrolet','Cobalt','car','1.4 LT',2016,'1.4','gasoline',10200,12900);
  perform seed_vehicle('Chevrolet','Cobalt','car','1.8 Elite',2019,'1.8','gasoline',9400,12100);
  perform seed_vehicle('Chevrolet','Spin','car','1.8 Activ',2020,'1.8','gasoline',9100,11500);
  perform seed_vehicle('Chevrolet','Spin','car','1.8 LTZ 7 lugares',2022,'1.8','gasoline',9000,11600);
  perform seed_vehicle('Chevrolet','Spin','car','1.8 Premier',2023,'1.8','gasoline',9000,11500);
  perform seed_vehicle('Chevrolet','Joy','car','1.0 Joy',2019,'1.0','gasoline',12400,15100);
  perform seed_vehicle('Chevrolet','Joy','car','1.0 Joy Plus',2021,'1.0','gasoline',12200,15000);
  perform seed_vehicle('Chevrolet','Celta','car','1.0 LS',2013,'1.0','gasoline',11800,14000);
  perform seed_vehicle('Chevrolet','Celta','car','1.0 LT',2015,'1.0','gasoline',11700,13900);
  perform seed_vehicle('Chevrolet','Classic','car','1.0 LS',2014,'1.0','gasoline',11500,13800);
  perform seed_vehicle('Chevrolet','Cruze','car','1.8 LT',2015,'1.8','gasoline',9600,12800);
  perform seed_vehicle('Chevrolet','Cruze','car','1.4 Turbo LT',2020,'1.4 T','gasoline',10400,13800);
  perform seed_vehicle('Chevrolet','Tracker','car','1.0 Turbo LT',2021,'1.0 T','gasoline',10800,13900);
  perform seed_vehicle('Chevrolet','Tracker','car','1.2 Turbo Premier',2023,'1.2 T','gasoline',10500,13600);
  perform seed_vehicle('Chevrolet','Montana','car','1.4 LS',2019,'1.4','gasoline',9900,12600);
  perform seed_vehicle('Chevrolet','Montana','car','1.2 Turbo LTZ',2023,'1.2 T','gasoline',10600,13400);

  -- Fiat
  perform seed_vehicle('Fiat','Argo','car','1.3 Drive',2021,'1.3','gasoline',11200,13900);
  perform seed_vehicle('Fiat','Argo','car','1.0 Trekking',2023,'1.0','gasoline',11900,14500);
  perform seed_vehicle('Fiat','Cronos','car','1.8 Precision',2020,'1.8','gasoline',9800,12900);
  perform seed_vehicle('Fiat','Cronos','car','1.0 Turbo',2023,'1.0 T','gasoline',11000,14200);
  perform seed_vehicle('Fiat','Mobi','car','1.0 Trekking',2023,'1.0','gasoline',12500,15000);
  perform seed_vehicle('Fiat','Uno','car','1.0 Way',2016,'1.0','gasoline',11900,14300);
  perform seed_vehicle('Fiat','Uno','car','1.3 Firefly',2019,'1.3','gasoline',11000,13700);
  perform seed_vehicle('Fiat','Palio','car','1.0 Attractive',2016,'1.0','gasoline',11600,14000);
  perform seed_vehicle('Fiat','Palio','car','1.4 Weekend',2015,'1.4','gasoline',10300,13000);
  perform seed_vehicle('Fiat','Siena','car','1.0 EL',2015,'1.0','gasoline',11500,14100);
  perform seed_vehicle('Fiat','Grand Siena','car','1.0 Attractive',2017,'1.0','gasoline',11400,14000);
  perform seed_vehicle('Fiat','Strada','car','1.4 Working',2018,'1.4','gasoline',9900,12700);
  perform seed_vehicle('Fiat','Strada','car','1.3 Freedom',2022,'1.3','gasoline',10400,13200);
  perform seed_vehicle('Fiat','Toro','car','1.8 Endurance',2021,'1.8','gasoline',9100,12000);
  perform seed_vehicle('Fiat','Toro','car','2.0 Diesel Volcano',2020,'2.0','diesel',10500,13800);
  perform seed_vehicle('Fiat','Punto','car','1.4 Attractive',2015,'1.4','gasoline',10600,13200);
  perform seed_vehicle('Fiat','Idea','car','1.4 Attractive',2015,'1.4','gasoline',10400,13000);

  -- Volkswagen
  perform seed_vehicle('Volkswagen','Gol','car','1.6 MSI',2018,'1.6','gasoline',10400,13400);
  perform seed_vehicle('Volkswagen','Gol','car','1.0 Trendline',2016,'1.0','gasoline',11700,14300);
  perform seed_vehicle('Volkswagen','Gol','car','1.0 Last Edition',2022,'1.0','gasoline',11900,14600);
  perform seed_vehicle('Volkswagen','Voyage','car','1.0 Trendline',2017,'1.0','gasoline',11500,14200);
  perform seed_vehicle('Volkswagen','Polo','car','1.6 MSI',2020,'1.6','gasoline',10500,13600);
  perform seed_vehicle('Volkswagen','Polo','car','1.0 TSI Comfortline',2022,'1.0 T','gasoline',11400,14800);
  perform seed_vehicle('Volkswagen','Virtus','car','1.6 MSI',2019,'1.6','gasoline',10400,13500);
  perform seed_vehicle('Volkswagen','Virtus','car','1.0 TSI Highline',2023,'1.0 T','gasoline',11300,14800);
  perform seed_vehicle('Volkswagen','Fox','car','1.0 Connect',2018,'1.0','gasoline',11600,14200);
  perform seed_vehicle('Volkswagen','Fox','car','1.6 Comfortline',2017,'1.6','gasoline',10300,13100);
  perform seed_vehicle('Volkswagen','Saveiro','car','1.6 Cross',2019,'1.6','gasoline',9500,12400);
  perform seed_vehicle('Volkswagen','T-Cross','car','200 TSI Comfortline',2021,'1.0 T','gasoline',10900,14000);
  perform seed_vehicle('Volkswagen','T-Cross','car','200 TSI Highline',2023,'1.0 T','gasoline',10800,13900);
  perform seed_vehicle('Volkswagen','Jetta','car','1.4 TSI Comfortline',2019,'1.4 T','gasoline',10200,13800);
  perform seed_vehicle('Volkswagen','Up','car','1.0 take up',2016,'1.0','gasoline',12600,15400);
  perform seed_vehicle('Volkswagen','Up','car','1.0 TSI move up',2017,'1.0 T','gasoline',12000,15000);

  -- Hyundai
  perform seed_vehicle('Hyundai','HB20','car','1.0 Comfort',2016,'1.0','gasoline',11800,14500);
  perform seed_vehicle('Hyundai','HB20','car','1.6 Comfort',2018,'1.6','gasoline',10200,13100);
  perform seed_vehicle('Hyundai','HB20','car','1.0 Turbo Evolution',2023,'1.0 T','gasoline',11200,14400);
  perform seed_vehicle('Hyundai','HB20S','car','1.6 Evolution',2022,'1.6','gasoline',10300,13200);
  perform seed_vehicle('Hyundai','Creta','car','2.0 Prestige',2020,'2.0','gasoline',9200,12300);
  perform seed_vehicle('Hyundai','Creta','car','1.0 Turbo Comfort',2023,'1.0 T','gasoline',10400,13400);
  perform seed_vehicle('Hyundai','Tucson','car','1.6 Turbo GLS',2019,'1.6 T','gasoline',9400,12500);
  perform seed_vehicle('Hyundai','i30','car','2.0 GLS',2013,'2.0','gasoline',9300,12400);

  -- Renault
  perform seed_vehicle('Renault','Kwid','car','1.0 Life',2019,'1.0','gasoline',13400,15800);
  perform seed_vehicle('Renault','Kwid','car','1.0 Intense',2023,'1.0','gasoline',13000,15400);
  perform seed_vehicle('Renault','Sandero','car','1.6 Expression',2018,'1.6','gasoline',10400,13200);
  perform seed_vehicle('Renault','Sandero','car','1.0 Life',2022,'1.0','gasoline',11700,14200);
  perform seed_vehicle('Renault','Logan','car','1.6 Zen',2019,'1.6','gasoline',10500,13300);
  perform seed_vehicle('Renault','Duster','car','2.0 Dynamique',2018,'2.0','gasoline',8700,11500);
  perform seed_vehicle('Renault','Duster','car','1.6 Intense',2022,'1.6','gasoline',9500,12200);
  perform seed_vehicle('Renault','Stepway','car','1.0 Iconic',2022,'1.0','gasoline',11500,14000);
  perform seed_vehicle('Renault','Captur','car','1.6 Zen',2020,'1.6','gasoline',9600,12400);
  perform seed_vehicle('Renault','Oroch','car','1.6 Express',2021,'1.6','gasoline',9400,12100);

  -- Toyota
  perform seed_vehicle('Toyota','Etios','car','1.3 X',2018,'1.3','gasoline',11900,14600);
  perform seed_vehicle('Toyota','Etios Sedan','car','1.5 XLS',2020,'1.5','gasoline',11100,13900);
  perform seed_vehicle('Toyota','Etios Sedan','car','1.5 XS',2018,'1.5','gasoline',11200,14000);
  perform seed_vehicle('Toyota','Yaris','car','1.3 XL',2020,'1.3','gasoline',11800,14500);
  perform seed_vehicle('Toyota','Yaris Sedan','car','1.5 XS',2022,'1.5','gasoline',11200,14100);
  perform seed_vehicle('Toyota','Yaris Sedan','car','1.5 XL Plus',2020,'1.5','gasoline',11300,14200);
  perform seed_vehicle('Toyota','Corolla','car','2.0 GLi',2020,'2.0','gasoline',10300,13900);
  perform seed_vehicle('Toyota','Corolla','car','1.8 Altis Hybrid',2023,'1.8 H','gasoline',17900,16600);
  perform seed_vehicle('Toyota','Corolla Cross','car','2.0 XR',2022,'2.0','gasoline',9900,13200);
  perform seed_vehicle('Toyota','Corolla Cross','car','1.8 Hybrid XRE',2022,'1.8 H','gasoline',17200,16000);
  perform seed_vehicle('Toyota','Hilux','car','2.8 Diesel SR',2020,'2.8','diesel',8400,11200);

  -- Honda
  perform seed_vehicle('Honda','Civic','car','2.0 LXR',2016,'2.0','gasoline',10000,13400);
  perform seed_vehicle('Honda','Civic','car','1.5 Turbo Touring',2019,'1.5 T','gasoline',10100,13600);
  perform seed_vehicle('Honda','City','car','1.5 LX',2018,'1.5','gasoline',11200,13900);
  perform seed_vehicle('Honda','City','car','1.5 Touring',2022,'1.5','gasoline',11100,14000);
  perform seed_vehicle('Honda','Fit','car','1.4 DX',2016,'1.4','gasoline',11600,14000);
  perform seed_vehicle('Honda','HR-V','car','1.5 Turbo Touring',2023,'1.5 T','gasoline',10300,13400);
  perform seed_vehicle('Honda','WR-V','car','1.5 EX',2021,'1.5','gasoline',10900,13600);
  perform seed_vehicle('Honda','WR-V','car','1.5 EXL',2019,'1.5','gasoline',10800,13500);

  -- Nissan
  perform seed_vehicle('Nissan','March','car','1.6 SV',2018,'1.6','gasoline',10800,13400);
  perform seed_vehicle('Nissan','Versa','car','1.6 SL',2019,'1.6','gasoline',10500,13500);
  perform seed_vehicle('Nissan','Versa','car','1.0 Turbo Advance',2023,'1.0 T','gasoline',11000,14000);
  perform seed_vehicle('Nissan','Kicks','car','1.6 SV',2023,'1.6','gasoline',10100,13000);
  perform seed_vehicle('Nissan','Sentra','car','2.0 SV',2019,'2.0','gasoline',9600,12900);

  -- Ford
  perform seed_vehicle('Ford','Ka','car','1.5 SE',2020,'1.5','gasoline',10900,13700);
  perform seed_vehicle('Ford','Ka','car','1.0 SEL',2018,'1.0','gasoline',11800,14400);
  perform seed_vehicle('Ford','Ka Sedan','car','1.0 SE',2018,'1.0','gasoline',11400,14000);
  perform seed_vehicle('Ford','Fiesta','car','1.0 EcoBoost',2017,'1.0 T','gasoline',11400,14200);
  perform seed_vehicle('Ford','Fiesta','car','1.6 SE',2018,'1.6','gasoline',10500,13200);
  perform seed_vehicle('Ford','EcoSport','car','2.0 Titanium',2018,'2.0','gasoline',8900,11800);
  perform seed_vehicle('Ford','EcoSport','car','1.5 SE',2020,'1.5','gasoline',9700,12600);
  perform seed_vehicle('Ford','Focus','car','2.0 SE',2016,'2.0','gasoline',9200,12400);

  -- Peugeot
  perform seed_vehicle('Peugeot','208','car','1.6 Active',2017,'1.6','gasoline',10500,13300);
  perform seed_vehicle('Peugeot','208','car','1.2 Turbo Griffe',2022,'1.2 T','gasoline',11000,14000);
  perform seed_vehicle('Peugeot','2008','car','1.6 Griffe',2019,'1.6','gasoline',9600,12400);
  perform seed_vehicle('Peugeot','2008','car','1.0 Turbo Allure',2022,'1.0 T','gasoline',10800,13700);
  perform seed_vehicle('Peugeot','207','car','1.4 XR',2014,'1.4','gasoline',10300,12900);

  -- Citroën
  perform seed_vehicle('Citroën','C3','car','1.0 Feel',2023,'1.0','gasoline',11900,14600);
  perform seed_vehicle('Citroën','C3','car','1.6 Exclusive',2017,'1.6','gasoline',10200,12900);
  perform seed_vehicle('Citroën','C3 Aircross','car','1.0 Turbo Feel',2023,'1.0 T','gasoline',10400,13300);
  perform seed_vehicle('Citroën','C4 Cactus','car','1.6 Feel',2020,'1.6','gasoline',9800,12700);

  -- Jeep
  perform seed_vehicle('Jeep','Renegade','car','1.8 Longitude',2020,'1.8','gasoline',9200,12200);
  perform seed_vehicle('Jeep','Renegade','car','1.3 Turbo T270',2022,'1.3 T','gasoline',9900,13100);
  perform seed_vehicle('Jeep','Renegade','car','2.0 Diesel Longitude',2019,'2.0','diesel',10800,14000);
  perform seed_vehicle('Jeep','Compass','car','2.0 Longitude',2020,'2.0','gasoline',8800,11900);
  perform seed_vehicle('Jeep','Compass','car','1.3 Turbo Limited',2022,'1.3 T','gasoline',9600,12800);

  -- Caoa Chery
  perform seed_vehicle('Caoa Chery','QQ','car','1.0 Look',2018,'1.0','gasoline',12000,14400);
  perform seed_vehicle('Caoa Chery','Tiggo 5X','car','1.5 Turbo Pro',2022,'1.5 T','gasoline',9700,12600);
  perform seed_vehicle('Caoa Chery','Tiggo 7','car','1.5 Turbo Pro',2022,'1.5 T','gasoline',9400,12300);
  perform seed_vehicle('Caoa Chery','Arrizo 6','car','1.5 Turbo GSX',2022,'1.5 T','gasoline',10400,13600);

  -- Mitsubishi
  perform seed_vehicle('Mitsubishi','ASX','car','2.0 HPE',2019,'2.0','gasoline',9000,12000);
  perform seed_vehicle('Mitsubishi','L200','car','2.4 Diesel Triton Sport',2021,'2.4','diesel',8600,11500);
  perform seed_vehicle('Mitsubishi','Outlander','car','2.0 HPE',2019,'2.0','gasoline',8700,11600);

  -- Kia
  perform seed_vehicle('Kia','Picanto','car','1.0 EX',2016,'1.0','gasoline',12200,14800);
  perform seed_vehicle('Kia','Cerato','car','1.6 SX',2019,'1.6','gasoline',9900,13100);
  perform seed_vehicle('Kia','Rio','car','1.6 EX',2015,'1.6','gasoline',10400,13300);
  perform seed_vehicle('Kia','Sportage','car','2.0 LX',2018,'2.0','gasoline',8900,11900);

  -- JAC
  perform seed_vehicle('JAC','J3','car','1.4 Turin',2014,'1.4','gasoline',10600,13200);
  perform seed_vehicle('JAC','T40','car','1.5 Top',2019,'1.5','gasoline',10000,12800);

  -- Elétricos e híbridos plug-in. O schema guarda metros por litro e um
  -- carro elétrico não tem esse número, então fica null e a interface
  -- mostra um traço em vez de um valor que não quer dizer nada (§6).
  -- 
  -- BYD
  perform seed_vehicle('BYD','Dolphin Mini','car','GS',2024,'EV','electric',null,null);
  perform seed_vehicle('BYD','Seal','car','AWD',2024,'EV','electric',null,null);
  perform seed_vehicle('BYD','Song Plus','car','DM-i',2023,'EV','electric',null,null);
  perform seed_vehicle('BYD','Yuan Plus','car','Yuan Plus',2023,'EV','electric',null,null);

  -- GWM
  perform seed_vehicle('GWM','Ora 03','car','Skin',2023,'EV','electric',null,null);
  perform seed_vehicle('GWM','Haval H6','car','PHEV',2024,'EV','electric',null,null);

  -- JAC
  perform seed_vehicle('JAC','iEV40','car','iEV40',2019,'EV','electric',null,null);

  -- ----------------------------------------------------------- motos ------
  -- Honda
  perform seed_vehicle('Honda','CG 160 Fan','motorcycle','Fan',2021,'160','gasoline',40500,45500);
  perform seed_vehicle('Honda','CG 160 Fan','motorcycle','Fan 2024',2024,'160','gasoline',40000,45000);
  perform seed_vehicle('Honda','CG 160 Titan','motorcycle','Titan',2021,'160','gasoline',39000,44000);
  perform seed_vehicle('Honda','CG 160 Titan','motorcycle','Titan 2024',2024,'160','gasoline',39500,44500);
  perform seed_vehicle('Honda','CG 160 Start','motorcycle','Start',2021,'160','gasoline',41000,46000);
  perform seed_vehicle('Honda','CG 160 Cargo','motorcycle','Cargo',2021,'160','gasoline',38000,43000);
  perform seed_vehicle('Honda','CG 160 Cargo','motorcycle','Cargo 2024',2024,'160','gasoline',38500,43500);
  perform seed_vehicle('Honda','CG 160','motorcycle','Fan 2023',2023,'160','gasoline',40500,45500);
  perform seed_vehicle('Honda','Biz 125','motorcycle','EX',2023,'125','gasoline',44000,47000);
  perform seed_vehicle('Honda','Biz 110i','motorcycle','ES',2021,'110','gasoline',49000,52000);
  perform seed_vehicle('Honda','Pop 110i','motorcycle','Pop',2023,'110','gasoline',50000,52000);
  perform seed_vehicle('Honda','Bros 160','motorcycle','ESD',2021,'160','gasoline',37000,41000);
  perform seed_vehicle('Honda','Bros 160','motorcycle','Sahara Rally',2023,'160','gasoline',36000,40000);
  perform seed_vehicle('Honda','NXR 160','motorcycle','Bros ESDD',2018,'160','gasoline',36000,40000);
  perform seed_vehicle('Honda','Elite 125','motorcycle','Elite',2021,'125','gasoline',42000,44000);
  perform seed_vehicle('Honda','PCX 160','motorcycle','DLX',2022,'160','gasoline',36000,38000);
  perform seed_vehicle('Honda','PCX 150','motorcycle','Sport',2019,'150','gasoline',38500,40500);
  perform seed_vehicle('Honda','SH 300i','motorcycle','SH 300i',2019,'300','gasoline',26000,30000);
  perform seed_vehicle('Honda','CB 300F','motorcycle','Twister ABS',2024,'300','gasoline',29500,33500);
  perform seed_vehicle('Honda','XRE 190','motorcycle','ABS 2023',2023,'190','gasoline',34500,38500);

  -- Yamaha
  perform seed_vehicle('Yamaha','Factor 150','motorcycle','i ED',2019,'150','gasoline',40500,44500);
  perform seed_vehicle('Yamaha','Factor 150','motorcycle','UBS',2023,'150','gasoline',39500,43500);
  perform seed_vehicle('Yamaha','Factor 125','motorcycle','ED',2018,'125','gasoline',45000,49000);
  perform seed_vehicle('Yamaha','Fazer 150','motorcycle','SED',2016,'150','gasoline',39000,43000);
  perform seed_vehicle('Yamaha','Fazer 250','motorcycle','BlueFlex',2018,'250','gasoline',31000,35000);
  perform seed_vehicle('Yamaha','YBR 125','motorcycle','Factor ED',2015,'125','gasoline',46000,50000);
  perform seed_vehicle('Yamaha','YBR 150','motorcycle','Factor SED',2021,'150','gasoline',40500,44500);
  perform seed_vehicle('Yamaha','Crosser 150','motorcycle','Z ABS',2023,'150','gasoline',35500,39500);
  perform seed_vehicle('Yamaha','Lander 250','motorcycle','ABS',2021,'250','gasoline',30000,34000);
  perform seed_vehicle('Yamaha','Neo 125','motorcycle','UBS',2022,'125','gasoline',43000,45000);
  perform seed_vehicle('Yamaha','NMax 160','motorcycle','Connected',2023,'160','gasoline',36500,38500);
  perform seed_vehicle('Yamaha','MT-03','motorcycle','ABS',2021,'300','gasoline',26000,30000);

  -- Suzuki
  perform seed_vehicle('Suzuki','Yes 125','motorcycle','Yes',2016,'125','gasoline',44000,48000);
  perform seed_vehicle('Suzuki','Intruder 125','motorcycle','Intruder',2015,'125','gasoline',43000,47000);
  perform seed_vehicle('Suzuki','Burgman 125','motorcycle','Burgman',2021,'125','gasoline',38000,40000);
  perform seed_vehicle('Suzuki','GSX-S150','motorcycle','GSX-S150',2020,'150','gasoline',32000,36000);

  -- Haojue
  perform seed_vehicle('Haojue','DK 150','motorcycle','DK 160',2023,'160','gasoline',37000,41000);
  perform seed_vehicle('Haojue','Chopper Road 150','motorcycle','Road',2021,'150','gasoline',39000,43000);
  perform seed_vehicle('Haojue','Master Ride 150','motorcycle','Master',2022,'150','gasoline',38000,42000);
  perform seed_vehicle('Haojue','NK 150','motorcycle','NK',2021,'150','gasoline',36000,40000);

  -- Shineray
  perform seed_vehicle('Shineray','XY 150','motorcycle','Worker',2021,'150','gasoline',38000,42000);
  perform seed_vehicle('Shineray','Worker 125','motorcycle','Worker',2021,'125','gasoline',42000,46000);
  perform seed_vehicle('Shineray','Phoenix 50','motorcycle','Phoenix',2021,'50','gasoline',54000,56000);
  perform seed_vehicle('Shineray','XY 50Q','motorcycle','XY 50Q',2021,'50','gasoline',55000,57000);
  perform seed_vehicle('Shineray','Jet 50','motorcycle','Jet 2023',2023,'50','gasoline',55000,57000);

  -- Dafra
  perform seed_vehicle('Dafra','NH 190','motorcycle','NH',2021,'190','gasoline',33000,37000);
  perform seed_vehicle('Dafra','Citycom 300','motorcycle','Citycom i',2020,'300','gasoline',26000,30000);
  perform seed_vehicle('Dafra','Apache 150','motorcycle','RTR',2019,'150','gasoline',35000,39000);
  perform seed_vehicle('Dafra','Horizon 150','motorcycle','Horizon',2016,'150','gasoline',37000,41000);

  -- Kawasaki
  perform seed_vehicle('Kawasaki','Ninja 400','motorcycle','ABS',2021,'400','gasoline',24000,28000);
  perform seed_vehicle('Kawasaki','Z400','motorcycle','ABS',2021,'400','gasoline',24000,28000);

  -- Royal Enfield
  perform seed_vehicle('Royal Enfield','Meteor 350','motorcycle','Meteor',2022,'350','gasoline',28000,32000);
  perform seed_vehicle('Royal Enfield','Himalayan','motorcycle','Himalayan 411',2022,'410','gasoline',26000,30000);

  -- Mottu
  perform seed_vehicle('Mottu','Pop 110i','motorcycle','Pop',2022,'110','gasoline',50000,52000);
  perform seed_vehicle('Mottu','Sport 110i','motorcycle','Sport',2022,'110','gasoline',48000,50000);

  -- -------------------------------------------- motos, modelos novos ------
  -- Honda
  perform seed_vehicle('Honda','CB 250F Twister','motorcycle','Twister',2019,'250','gasoline',31000,35000);
  perform seed_vehicle('Honda','CB 500F','motorcycle','ABS',2020,'500','gasoline',24000,28000);
  perform seed_vehicle('Honda','CB 500X','motorcycle','ABS',2021,'500','gasoline',23000,27000);
  perform seed_vehicle('Honda','XRE 300','motorcycle','ABS',2019,'300','gasoline',29000,33000);
  perform seed_vehicle('Honda','XRE 300','motorcycle','Sahara Rally',2023,'300','gasoline',27500,31500);
  perform seed_vehicle('Honda','NX 400 Falcon','motorcycle','Falcon',2008,'400','gasoline',26000,30000);
  perform seed_vehicle('Honda','ADV 150','motorcycle','ADV',2021,'150','gasoline',34000,36000);

  -- Yamaha
  perform seed_vehicle('Yamaha','FZ25 Fazer','motorcycle','ABS',2020,'250','gasoline',30000,34000);
  perform seed_vehicle('Yamaha','FZ15 Fazer','motorcycle','ABS',2023,'150','gasoline',36000,40000);
  perform seed_vehicle('Yamaha','XTZ 150 Crosser','motorcycle','S',2018,'150','gasoline',34000,38000);
  perform seed_vehicle('Yamaha','Fluo 125','motorcycle','Fluo',2021,'125','gasoline',44000,46000);

  -- Suzuki
  perform seed_vehicle('Suzuki','V-Strom 650','motorcycle','XT',2021,'650','gasoline',20000,24000);

  -- Bajaj
  perform seed_vehicle('Bajaj','Dominar 400','motorcycle','Dominar',2022,'400','gasoline',25000,29000);
  perform seed_vehicle('Bajaj','Pulsar NS 200','motorcycle','NS',2023,'200','gasoline',31000,35000);
  perform seed_vehicle('Bajaj','Pulsar N160','motorcycle','N160',2023,'160','gasoline',34000,38000);

  -- Royal Enfield
  perform seed_vehicle('Royal Enfield','Hunter 350','motorcycle','Hunter',2023,'350','gasoline',29000,33000);

  -- Kawasaki
  perform seed_vehicle('Kawasaki','Versys 650','motorcycle','Tourer',2020,'650','gasoline',20000,24000);

  -- BMW
  perform seed_vehicle('BMW','G 310 R','motorcycle','ABS',2021,'310','gasoline',28000,32000);
  perform seed_vehicle('BMW','G 310 GS','motorcycle','ABS',2021,'310','gasoline',27000,31000);

  -- Triumph
  perform seed_vehicle('Triumph','Trident 660','motorcycle','Trident',2022,'660','gasoline',19000,23000);

  -- Quem entrega de bicicleta não abastece. Sem combustível e sem consumo,
  -- o aplicativo deixa de mostrar as contas por litro e mantém as contas
  -- por hora e por km, que são as que valem para ele.
  -- ------------------------------------------------------ bicicletas ------
  -- Caloi
  perform seed_vehicle('Caloi','Explorer Sport','bicycle','Sport',2022,null,null,null,null);
  perform seed_vehicle('Caloi','Elite Carbon','bicycle','Racing',2022,null,null,null,null);
  perform seed_vehicle('Caloi','Velox','bicycle','Velox',2021,null,null,null,null);

  -- Sense
  perform seed_vehicle('Sense','Move','bicycle','Urban',2022,null,null,null,null);
  perform seed_vehicle('Sense','Impact','bicycle','Comp',2022,null,null,null,null);

  -- Oggi
  perform seed_vehicle('Oggi','Hacker Sport','bicycle','Sport',2022,null,null,null,null);
  perform seed_vehicle('Oggi','Big Wheel','bicycle','7.0',2022,null,null,null,null);

  -- Track e Bikes
  perform seed_vehicle('Track e Bikes','TKS26','bicycle','Aro 26',2021,null,null,null,null);

  -- Mobele
  perform seed_vehicle('Mobele','Urbana','bicycle','Elétrica',2023,null,null,null,null);
end;
$$;
