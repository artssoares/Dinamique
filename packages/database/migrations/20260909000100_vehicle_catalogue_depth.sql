-- ============================================================================
-- Catálogo de veículos: profundidade.
--
-- A rodada anterior garantiu que todo modelo tivesse ao menos uma versão. O
-- que ela não resolveu foi a largura da lista: Royal Enfield tinha três
-- modelos num catálogo onde a marca vende treze, e o mesmo buraco existia em
-- quase toda marca. Quem não acha a sua moto na lista digita o nome no campo
-- livre, e um veículo sem versão de catálogo não tem consumo de referência.
--
-- Esta migration acrescenta 317 versões: modelos que faltavam em toda
-- marca que já existia, marcas novas que rodam em aplicativo (Harley, Ducati,
-- Kymco, Kasinski, Traxx, Sundown, Voltz nas motos; Audi, BMW, Mercedes-Benz,
-- Volvo, Iveco e Suzuki nos carros, incluindo as vans de fretamento), e mais
-- anos e acabamentos nos modelos que mais rodam.
--
-- O consumo continua sendo referência em metros por litro (10,8 km/l = 10800),
-- e o consumo medido do próprio motorista prevalece assim que ele aceita a
-- troca (§31). Elétricos entram com consumo nulo: a coluna guarda metros por
-- litro e um carro elétrico não tem esse número.
--
-- Nomes de modelo conferidos contra o que já está no banco, para uma versão
-- nova cair no modelo certo em vez de criar um quase-duplicado ao lado dele.
-- ============================================================================

do $$
begin
  -- ----------------------------------------------- carros, novos modelos ---
  -- Chevrolet
  perform seed_vehicle('Chevrolet','Agile','car','1.4 LT',2013,'1.4','gasoline',10600,13400);
  perform seed_vehicle('Chevrolet','Corsa','car','1.0 Maxx',2010,'1.0','gasoline',11400,14000);
  perform seed_vehicle('Chevrolet','Corsa','car','1.4 Premium',2011,'1.4','gasoline',10300,13000);
  perform seed_vehicle('Chevrolet','Corsa Sedan','car','1.4 Premium',2011,'1.4','gasoline',10200,12900);
  perform seed_vehicle('Chevrolet','Astra','car','2.0 Advantage',2011,'2.0','gasoline',9200,12400);
  perform seed_vehicle('Chevrolet','Astra Sedan','car','2.0 Elegance',2010,'2.0','gasoline',9100,12300);
  perform seed_vehicle('Chevrolet','Vectra','car','2.0 Elegance',2010,'2.0','gasoline',8900,12000);
  perform seed_vehicle('Chevrolet','Meriva','car','1.8 Joy',2011,'1.8','gasoline',9000,11900);
  perform seed_vehicle('Chevrolet','Zafira','car','2.0 Elegance',2011,'2.0','gasoline',8600,11400);
  perform seed_vehicle('Chevrolet','S10','car','2.8 Diesel LS',2020,'2.8','diesel',8200,11000);
  perform seed_vehicle('Chevrolet','S10','car','2.5 Flex LT',2019,'2.5','gasoline',7600,10400);
  perform seed_vehicle('Chevrolet','Trailblazer','car','2.8 Diesel LTZ',2020,'2.8','diesel',7800,10600);
  perform seed_vehicle('Chevrolet','Equinox','car','1.5 Turbo Premier',2021,'1.5 T','gasoline',9400,12600);
  perform seed_vehicle('Chevrolet','Spin Activ','car','1.8 Activ',2021,'1.8','gasoline',9000,11500);

  -- Fiat
  perform seed_vehicle('Fiat','Palio Weekend','car','1.4 Attractive',2016,'1.4','gasoline',10200,12900);
  perform seed_vehicle('Fiat','Doblo','car','1.8 Essence 7 lugares',2019,'1.8','gasoline',8800,11400);
  perform seed_vehicle('Fiat','Fiorino','car','1.4 Endurance',2021,'1.4','gasoline',9600,12100);
  perform seed_vehicle('Fiat','Linea','car','1.8 Absolute',2014,'1.8','gasoline',9300,12300);
  perform seed_vehicle('Fiat','Bravo','car','1.8 Essence',2015,'1.8','gasoline',9400,12400);
  perform seed_vehicle('Fiat','Pulse','car','1.3 Drive',2022,'1.3','gasoline',10900,13600);
  perform seed_vehicle('Fiat','Pulse','car','1.0 Turbo Impetus',2023,'1.0 T','gasoline',10700,13900);
  perform seed_vehicle('Fiat','Fastback','car','1.0 Turbo Audace',2023,'1.0 T','gasoline',10600,13800);
  perform seed_vehicle('Fiat','Ducato','car','2.3 Diesel Multi',2021,'2.3','diesel',8500,11500);
  perform seed_vehicle('Fiat','500','car','1.4 Cult',2014,'1.4','gasoline',11000,13600);

  -- Volkswagen
  perform seed_vehicle('Volkswagen','Golf','car','1.4 TSI Comfortline',2018,'1.4 T','gasoline',10400,13900);
  perform seed_vehicle('Volkswagen','Golf','car','1.6 Sportline',2013,'1.6','gasoline',9800,12900);
  perform seed_vehicle('Volkswagen','Nivus','car','200 TSI Highline',2023,'1.0 T','gasoline',11100,14400);
  perform seed_vehicle('Volkswagen','Taos','car','250 TSI Comfortline',2022,'1.4 T','gasoline',9600,12900);
  perform seed_vehicle('Volkswagen','Tiguan','car','250 TSI Allspace',2021,'1.4 T','gasoline',9200,12400);
  perform seed_vehicle('Volkswagen','Amarok','car','2.0 Diesel Highline',2020,'2.0','diesel',8500,11200);
  perform seed_vehicle('Volkswagen','SpaceFox','car','1.6 Comfortline',2014,'1.6','gasoline',10100,13000);
  perform seed_vehicle('Volkswagen','CrossFox','car','1.6 I-Motion',2014,'1.6','gasoline',9900,12700);
  perform seed_vehicle('Volkswagen','Parati','car','1.6 Track e Field',2012,'1.6','gasoline',9800,12600);
  perform seed_vehicle('Volkswagen','Kombi','car','1.4 Flex',2013,'1.4','gasoline',8200,10400);
  perform seed_vehicle('Volkswagen','Passat','car','2.0 TSI Highline',2018,'2.0 T','gasoline',9200,12800);
  perform seed_vehicle('Volkswagen','Bora','car','2.0 Comfortline',2010,'2.0','gasoline',8800,11900);
  perform seed_vehicle('Volkswagen','Polo Sedan','car','1.6 Comfortline',2013,'1.6','gasoline',10000,13000);

  -- Hyundai
  perform seed_vehicle('Hyundai','HB20X','car','1.6 Style',2018,'1.6','gasoline',9900,12800);
  perform seed_vehicle('Hyundai','Elantra','car','2.0 GLS',2016,'2.0','gasoline',9400,12900);
  perform seed_vehicle('Hyundai','ix35','car','2.0 GL',2018,'2.0','gasoline',8900,11900);
  perform seed_vehicle('Hyundai','Santa Fe','car','3.5 V6 GLS',2018,'3.5','gasoline',7400,10400);
  perform seed_vehicle('Hyundai','Azera','car','3.0 V6',2015,'3.0','gasoline',7800,11000);
  perform seed_vehicle('Hyundai','Kona','car','1.0 Turbo',2022,'1.0 T','gasoline',10600,13600);

  -- Renault
  perform seed_vehicle('Renault','Clio','car','1.0 Authentique',2015,'1.0','gasoline',11800,14200);
  perform seed_vehicle('Renault','Fluence','car','2.0 Dynamique',2016,'2.0','gasoline',9000,12400);
  perform seed_vehicle('Renault','Symbol','car','1.6 Expression',2013,'1.6','gasoline',10200,13000);
  perform seed_vehicle('Renault','Megane','car','2.0 Dynamique',2012,'2.0','gasoline',8800,11900);
  perform seed_vehicle('Renault','Master','car','2.3 Diesel Minibus',2021,'2.3','diesel',8400,11200);
  perform seed_vehicle('Renault','Kangoo','car','1.6 Express',2019,'1.6','gasoline',9300,12000);
  perform seed_vehicle('Renault','Kardian','car','1.0 Turbo Iconic',2024,'1.0 T','gasoline',11200,14300);
  perform seed_vehicle('Renault','Scenic','car','1.6 Authentique',2011,'1.6','gasoline',9400,12200);

  -- Toyota
  perform seed_vehicle('Toyota','RAV4','car','2.5 Hybrid SX',2022,'2.5 H','gasoline',14800,15200);
  perform seed_vehicle('Toyota','SW4','car','2.8 Diesel SRX',2021,'2.8','diesel',8000,10900);
  perform seed_vehicle('Toyota','Corolla Fielder','car','1.8 XEi',2014,'1.8','gasoline',10200,13400);
  perform seed_vehicle('Toyota','Prius','car','1.8 Hybrid',2018,'1.8 H','gasoline',18900,17400);
  perform seed_vehicle('Toyota','Camry','car','3.5 V6',2018,'3.5','gasoline',8200,11800);

  -- Honda
  perform seed_vehicle('Honda','CR-V','car','1.5 Turbo Touring',2021,'1.5 T','gasoline',9800,12900);
  perform seed_vehicle('Honda','Accord','car','2.0 Hybrid',2020,'2.0 H','gasoline',15600,15000);
  perform seed_vehicle('Honda','City Hatchback','car','1.5 Touring',2023,'1.5','gasoline',11200,14100);
  perform seed_vehicle('Honda','ZR-V','car','2.0 Advance',2024,'2.0','gasoline',9700,12800);

  -- Nissan
  perform seed_vehicle('Nissan','Frontier','car','2.3 Diesel Attack',2021,'2.3','diesel',8600,11400);
  perform seed_vehicle('Nissan','Livina','car','1.8 SL',2014,'1.8','gasoline',9600,12400);
  perform seed_vehicle('Nissan','Grand Livina','car','1.8 SL 7 lugares',2014,'1.8','gasoline',9300,12100);
  perform seed_vehicle('Nissan','Tiida','car','1.8 SL',2013,'1.8','gasoline',9500,12300);
  perform seed_vehicle('Nissan','X-Trail','car','2.5 SE',2012,'2.5','gasoline',8200,11200);
  perform seed_vehicle('Nissan','Leaf','car','Leaf',2021,'EV','electric',null,null);

  -- Ford
  perform seed_vehicle('Ford','Ranger','car','3.2 Diesel XLS',2020,'3.2','diesel',7900,10600);
  perform seed_vehicle('Ford','Ranger','car','2.2 Diesel XL',2018,'2.2','diesel',8600,11400);
  perform seed_vehicle('Ford','Fusion','car','2.5 SEL',2014,'2.5','gasoline',8600,11800);
  perform seed_vehicle('Ford','Territory','car','1.5 Turbo Titanium',2022,'1.5 T','gasoline',9500,12500);
  perform seed_vehicle('Ford','Fiesta Sedan','car','1.6 SE',2014,'1.6','gasoline',10300,13000);
  perform seed_vehicle('Ford','Courier','car','1.6 L',2012,'1.6','gasoline',9800,12600);
  perform seed_vehicle('Ford','Edge','car','3.5 V6 Limited',2014,'3.5','gasoline',7400,10600);

  -- Peugeot
  perform seed_vehicle('Peugeot','206','car','1.4 Presence',2008,'1.4','gasoline',10600,13200);
  perform seed_vehicle('Peugeot','307','car','1.6 Presence',2010,'1.6','gasoline',9400,12200);
  perform seed_vehicle('Peugeot','308','car','1.6 Allure',2015,'1.6','gasoline',9600,12500);
  perform seed_vehicle('Peugeot','3008','car','1.6 Turbo Griffe',2019,'1.6 T','gasoline',9200,12400);
  perform seed_vehicle('Peugeot','408','car','2.0 Allure',2015,'2.0','gasoline',8800,11900);
  perform seed_vehicle('Peugeot','Partner','car','1.6 Furgao',2019,'1.6','gasoline',9500,12200);
  perform seed_vehicle('Peugeot','Boxer','car','2.3 Diesel Minibus',2021,'2.3','diesel',8400,11300);

  -- Citroën
  perform seed_vehicle('Citroën','C4','car','2.0 Exclusive',2014,'2.0','gasoline',8800,11900);
  perform seed_vehicle('Citroën','C4 Lounge','car','1.6 Turbo Exclusive',2017,'1.6 T','gasoline',9400,12800);
  perform seed_vehicle('Citroën','Xsara Picasso','car','2.0 Exclusive',2011,'2.0','gasoline',8600,11500);
  perform seed_vehicle('Citroën','Aircross','car','1.6 Feel',2016,'1.6','gasoline',9500,12200);
  perform seed_vehicle('Citroën','Berlingo','car','1.6 Furgao',2019,'1.6','gasoline',9400,12100);
  perform seed_vehicle('Citroën','C3 Picasso','car','1.6 Exclusive',2014,'1.6','gasoline',9300,12000);
  perform seed_vehicle('Citroën','Basalt','car','1.0 Turbo Feel',2024,'1.0 T','gasoline',10800,13900);

  -- Jeep
  perform seed_vehicle('Jeep','Commander','car','1.3 Turbo Longitude',2022,'1.3 T','gasoline',9200,12400);
  perform seed_vehicle('Jeep','Commander','car','2.0 Diesel Overland',2022,'2.0','diesel',10200,13400);
  perform seed_vehicle('Jeep','Cherokee','car','3.2 V6 Limited',2016,'3.2','gasoline',7600,10800);
  perform seed_vehicle('Jeep','Grand Cherokee','car','3.6 V6 Limited',2018,'3.6','gasoline',7200,10400);

  -- Kia
  perform seed_vehicle('Kia','Soul','car','1.6 EX',2015,'1.6','gasoline',9800,12800);
  perform seed_vehicle('Kia','Sorento','car','2.4 EX',2016,'2.4','gasoline',8200,11400);
  perform seed_vehicle('Kia','Carnival','car','3.5 V6 EX',2015,'3.5','gasoline',7200,10200);
  perform seed_vehicle('Kia','Bongo','car','2.5 Diesel K2500',2019,'2.5','diesel',9400,12000);
  perform seed_vehicle('Kia','Seltos','car','1.6 EX',2022,'1.6','gasoline',9900,12900);
  perform seed_vehicle('Kia','Stonic','car','1.0 Turbo',2023,'1.0 T','gasoline',11000,14000);

  -- Mitsubishi
  perform seed_vehicle('Mitsubishi','Lancer','car','2.0 GT',2015,'2.0','gasoline',8800,12000);
  perform seed_vehicle('Mitsubishi','Pajero TR4','car','2.0 Flex',2014,'2.0','gasoline',8200,11000);
  perform seed_vehicle('Mitsubishi','Pajero Sport','car','2.4 Diesel HPE',2021,'2.4','diesel',8600,11600);
  perform seed_vehicle('Mitsubishi','Pajero Full','car','3.2 Diesel HPE',2018,'3.2','diesel',7400,10200);
  perform seed_vehicle('Mitsubishi','Eclipse Cross','car','1.5 Turbo HPE',2022,'1.5 T','gasoline',9400,12500);

  -- Caoa Chery
  perform seed_vehicle('Caoa Chery','Tiggo 2','car','1.5 Look',2021,'1.5','gasoline',10600,13400);
  perform seed_vehicle('Caoa Chery','Tiggo 3X','car','1.6 Sport',2022,'1.6','gasoline',10200,13000);
  perform seed_vehicle('Caoa Chery','Tiggo 8','car','1.6 Turbo Txs',2022,'1.6 T','gasoline',8800,11800);
  perform seed_vehicle('Caoa Chery','Celer','car','1.5 Sedan',2015,'1.5','gasoline',10400,13200);
  perform seed_vehicle('Caoa Chery','Cielo','car','1.6 Sedan',2013,'1.6','gasoline',9800,12600);

  -- BYD
  perform seed_vehicle('BYD','King','car','DM-i',2024,'EV','electric',null,null);
  perform seed_vehicle('BYD','Han','car','EV',2023,'EV','electric',null,null);
  perform seed_vehicle('BYD','Tan','car','EV',2023,'EV','electric',null,null);
  perform seed_vehicle('BYD','Song Pro','car','DM-i',2024,'EV','electric',null,null);
  perform seed_vehicle('BYD','Yuan Pro','car','EV',2023,'EV','electric',null,null);
  perform seed_vehicle('BYD','Dolphin Plus','car','EV',2024,'EV','electric',null,null);

  -- GWM
  perform seed_vehicle('GWM','Haval H6 GT','car','PHEV',2024,'EV','electric',null,null);
  perform seed_vehicle('GWM','Poer','car','2.0 Diesel',2024,'2.0','diesel',9200,12200);

  -- JAC
  perform seed_vehicle('JAC','J2','car','1.4 Hatch',2014,'1.4','gasoline',10800,13600);
  perform seed_vehicle('JAC','J5','car','1.5 Sedan',2014,'1.5','gasoline',10000,12900);
  perform seed_vehicle('JAC','J6','car','2.0 7 lugares',2013,'2.0','gasoline',8600,11400);
  perform seed_vehicle('JAC','T50','car','1.5 Turbo',2021,'1.5 T','gasoline',9800,12700);
  perform seed_vehicle('JAC','T60','car','2.0 Turbo',2021,'2.0 T','gasoline',9000,12000);
  perform seed_vehicle('JAC','T80','car','2.0 Turbo',2022,'2.0 T','gasoline',8800,11800);

  -- Suzuki
  perform seed_vehicle('Suzuki','Jimny','car','1.3 4Sport',2019,'1.3','gasoline',9600,12200);
  perform seed_vehicle('Suzuki','Vitara','car','1.6 4You',2017,'1.6','gasoline',9400,12400);
  perform seed_vehicle('Suzuki','S-Cross','car','1.6 4Style',2018,'1.6','gasoline',9500,12600);
  perform seed_vehicle('Suzuki','Swift','car','1.4 Sport',2013,'1.4','gasoline',10800,13600);

  -- Audi
  perform seed_vehicle('Audi','A3','car','1.4 TFSI Sedan',2019,'1.4 T','gasoline',10400,13800);
  perform seed_vehicle('Audi','A4','car','2.0 TFSI',2019,'2.0 T','gasoline',9400,13000);
  perform seed_vehicle('Audi','Q3','car','1.4 TFSI',2019,'1.4 T','gasoline',9600,12900);

  -- BMW
  perform seed_vehicle('BMW','320i','car','2.0 Turbo Sport',2019,'2.0 T','gasoline',9600,13200);
  perform seed_vehicle('BMW','X1','car','2.0 sDrive20i',2020,'2.0 T','gasoline',9400,12800);
  perform seed_vehicle('BMW','X3','car','2.0 xDrive30i',2020,'2.0 T','gasoline',8800,12200);

  -- Mercedes-Benz
  perform seed_vehicle('Mercedes-Benz','C180','car','1.6 Turbo Avantgarde',2018,'1.6 T','gasoline',9800,13400);
  perform seed_vehicle('Mercedes-Benz','A200','car','1.3 Turbo',2020,'1.3 T','gasoline',10200,13600);
  perform seed_vehicle('Mercedes-Benz','GLA200','car','1.3 Turbo',2021,'1.3 T','gasoline',9800,13000);
  perform seed_vehicle('Mercedes-Benz','Sprinter','car','2.2 Diesel Van 416',2021,'2.2','diesel',8200,11000);
  perform seed_vehicle('Mercedes-Benz','Sprinter','car','2.1 Diesel Minibus 415',2018,'2.1','diesel',8400,11200);

  -- Volvo
  perform seed_vehicle('Volvo','XC40','car','2.0 Turbo Momentum',2021,'2.0 T','gasoline',9200,12600);
  perform seed_vehicle('Volvo','XC60','car','2.0 Turbo Momentum',2021,'2.0 T','gasoline',8600,11900);

  -- Iveco
  perform seed_vehicle('Iveco','Daily','car','3.0 Diesel Minibus',2021,'3.0','diesel',7600,10400);

  -- ------------------------------------------------ motos, novos modelos ---
  -- Royal Enfield
  perform seed_vehicle('Royal Enfield','Classic 350','motorcycle','Classic',2022,'350','gasoline',28000,32000);
  perform seed_vehicle('Royal Enfield','Bullet 350','motorcycle','Bullet',2023,'350','gasoline',29000,33000);
  perform seed_vehicle('Royal Enfield','Scram 411','motorcycle','Scram',2023,'410','gasoline',26000,30000);
  perform seed_vehicle('Royal Enfield','Scram 440','motorcycle','Scram',2025,'440','gasoline',26500,30500);
  perform seed_vehicle('Royal Enfield','Himalayan 450','motorcycle','Himalayan',2024,'450','gasoline',25000,29000);
  perform seed_vehicle('Royal Enfield','Guerrilla 450','motorcycle','Guerrilla',2025,'450','gasoline',26000,30000);
  perform seed_vehicle('Royal Enfield','Interceptor 650','motorcycle','Interceptor',2022,'650','gasoline',21000,25000);
  perform seed_vehicle('Royal Enfield','Continental GT 650','motorcycle','Continental GT',2022,'650','gasoline',21000,25000);
  perform seed_vehicle('Royal Enfield','Super Meteor 650','motorcycle','Super Meteor',2024,'650','gasoline',20000,24000);
  perform seed_vehicle('Royal Enfield','Shotgun 650','motorcycle','Shotgun',2024,'650','gasoline',20500,24500);

  -- Honda
  perform seed_vehicle('Honda','CG 125 Fan','motorcycle','KS',2018,'125','gasoline',48000,52000);
  perform seed_vehicle('Honda','CG 150 Titan','motorcycle','EX',2015,'150','gasoline',40000,45000);
  perform seed_vehicle('Honda','CG 150 Fan','motorcycle','ESI',2015,'150','gasoline',41000,46000);
  perform seed_vehicle('Honda','Biz 100','motorcycle','ES',2012,'100','gasoline',52000,55000);
  perform seed_vehicle('Honda','Bros 150','motorcycle','NXR ESD',2014,'150','gasoline',38000,42000);
  perform seed_vehicle('Honda','CB 300R','motorcycle','ABS',2015,'300','gasoline',30000,34000);
  perform seed_vehicle('Honda','CBR 500R','motorcycle','ABS',2020,'500','gasoline',24000,28000);
  perform seed_vehicle('Honda','CB 650R','motorcycle','ABS',2021,'650','gasoline',19000,23000);
  perform seed_vehicle('Honda','CBR 650R','motorcycle','ABS',2021,'650','gasoline',18500,22500);
  perform seed_vehicle('Honda','NC 750X','motorcycle','DCT',2021,'750','gasoline',22000,26000);
  perform seed_vehicle('Honda','Africa Twin','motorcycle','CRF 1100L',2021,'1100','gasoline',17000,21000);
  perform seed_vehicle('Honda','CB 600F Hornet','motorcycle','Hornet',2014,'600','gasoline',20000,24000);
  perform seed_vehicle('Honda','CB 1000R','motorcycle','ABS',2020,'1000','gasoline',15000,19000);
  perform seed_vehicle('Honda','SH 150i','motorcycle','DLX',2021,'150','gasoline',37000,39000);
  perform seed_vehicle('Honda','Sahara 300','motorcycle','Rally',2023,'300','gasoline',27500,31500);

  -- Yamaha
  perform seed_vehicle('Yamaha','Crypton 115','motorcycle','ED',2018,'115','gasoline',48000,52000);
  perform seed_vehicle('Yamaha','YS 250 Fazer','motorcycle','BlueFlex',2016,'250','gasoline',30000,34000);
  perform seed_vehicle('Yamaha','XT 660R','motorcycle','XT',2018,'660','gasoline',22000,26000);
  perform seed_vehicle('Yamaha','Ténéré 250','motorcycle','XTZ 250',2018,'250','gasoline',28000,32000);
  perform seed_vehicle('Yamaha','Ténéré 700','motorcycle','Rally',2022,'700','gasoline',19000,23000);
  perform seed_vehicle('Yamaha','MT-07','motorcycle','ABS',2021,'700','gasoline',21000,25000);
  perform seed_vehicle('Yamaha','MT-09','motorcycle','ABS',2022,'900','gasoline',17000,21000);
  perform seed_vehicle('Yamaha','R3','motorcycle','ABS',2021,'320','gasoline',25000,29000);
  perform seed_vehicle('Yamaha','R15','motorcycle','ABS',2023,'150','gasoline',34000,38000);
  perform seed_vehicle('Yamaha','XJ6','motorcycle','N ABS',2016,'600','gasoline',20000,24000);
  perform seed_vehicle('Yamaha','Tracer 9','motorcycle','GT',2022,'900','gasoline',17500,21500);

  -- Suzuki
  perform seed_vehicle('Suzuki','GSX-S 750','motorcycle','ABS',2020,'750','gasoline',17000,21000);
  perform seed_vehicle('Suzuki','Bandit 650','motorcycle','ABS',2014,'650','gasoline',19000,23000);
  perform seed_vehicle('Suzuki','Burgman 400','motorcycle','ABS',2021,'400','gasoline',24000,27000);
  perform seed_vehicle('Suzuki','Address 125','motorcycle','Address',2019,'125','gasoline',42000,45000);
  perform seed_vehicle('Suzuki','GSR 150i','motorcycle','GSR',2018,'150','gasoline',35000,39000);
  perform seed_vehicle('Suzuki','Boulevard M800','motorcycle','M800',2016,'800','gasoline',16000,20000);
  perform seed_vehicle('Suzuki','V-Strom 1050','motorcycle','XT',2022,'1050','gasoline',16000,20000);
  perform seed_vehicle('Suzuki','Hayabusa','motorcycle','GSX 1300R',2022,'1300','gasoline',13000,17000);
  perform seed_vehicle('Suzuki','GN 125','motorcycle','GN',2010,'125','gasoline',44000,48000);

  -- Kawasaki
  perform seed_vehicle('Kawasaki','Ninja 300','motorcycle','ABS',2018,'300','gasoline',26000,30000);
  perform seed_vehicle('Kawasaki','Ninja 650','motorcycle','ABS',2021,'650','gasoline',20000,24000);
  perform seed_vehicle('Kawasaki','Ninja ZX-6R','motorcycle','ABS',2021,'600','gasoline',15000,19000);
  perform seed_vehicle('Kawasaki','Z650','motorcycle','ABS',2021,'650','gasoline',20000,24000);
  perform seed_vehicle('Kawasaki','Z900','motorcycle','ABS',2021,'900','gasoline',16000,20000);
  perform seed_vehicle('Kawasaki','Versys-X 300','motorcycle','Tourer',2021,'300','gasoline',25000,29000);
  perform seed_vehicle('Kawasaki','Vulcan S','motorcycle','ABS',2021,'650','gasoline',20000,24000);

  -- BMW
  perform seed_vehicle('BMW','F 750 GS','motorcycle','F 750 GS',2021,'850','gasoline',20000,24000);
  perform seed_vehicle('BMW','F 850 GS','motorcycle','Adventure',2021,'850','gasoline',19000,23000);
  perform seed_vehicle('BMW','R 1250 GS','motorcycle','Adventure',2022,'1250','gasoline',17000,21000);
  perform seed_vehicle('BMW','S 1000 RR','motorcycle','S 1000 RR',2021,'1000','gasoline',14000,18000);
  perform seed_vehicle('BMW','G 650 GS','motorcycle','G 650 GS',2015,'650','gasoline',24000,28000);
  perform seed_vehicle('BMW','F 900 R','motorcycle','F 900 R',2022,'900','gasoline',18000,22000);

  -- Triumph
  perform seed_vehicle('Triumph','Street Triple','motorcycle','765 RS',2022,'765','gasoline',17000,21000);
  perform seed_vehicle('Triumph','Tiger 800','motorcycle','XRx',2018,'800','gasoline',18000,22000);
  perform seed_vehicle('Triumph','Tiger 900','motorcycle','GT Pro',2022,'900','gasoline',17500,21500);
  perform seed_vehicle('Triumph','Bonneville T100','motorcycle','T100',2021,'900','gasoline',20000,24000);
  perform seed_vehicle('Triumph','Speed 400','motorcycle','Speed 400',2024,'400','gasoline',26000,30000);
  perform seed_vehicle('Triumph','Scrambler 400X','motorcycle','400X',2024,'400','gasoline',25500,29500);

  -- Harley-Davidson
  perform seed_vehicle('Harley-Davidson','Iron 883','motorcycle','Sportster',2020,'883','gasoline',17000,21000);
  perform seed_vehicle('Harley-Davidson','Forty-Eight','motorcycle','XL 1200X',2020,'1200','gasoline',15000,19000);
  perform seed_vehicle('Harley-Davidson','Street 750','motorcycle','Street',2019,'750','gasoline',19000,23000);
  perform seed_vehicle('Harley-Davidson','Sportster S','motorcycle','RH1250S',2022,'1250','gasoline',15000,19000);
  perform seed_vehicle('Harley-Davidson','Fat Boy','motorcycle','Softail',2021,'1868','gasoline',13000,17000);

  -- Ducati
  perform seed_vehicle('Ducati','Monster','motorcycle','Monster 937',2022,'937','gasoline',16000,20000);
  perform seed_vehicle('Ducati','Scrambler','motorcycle','Icon 800',2021,'800','gasoline',18000,22000);
  perform seed_vehicle('Ducati','Multistrada','motorcycle','V4 S',2022,'1158','gasoline',14000,18000);
  perform seed_vehicle('Ducati','Panigale V2','motorcycle','V2',2022,'955','gasoline',13000,17000);

  -- Bajaj
  perform seed_vehicle('Bajaj','Pulsar NS 160','motorcycle','NS',2023,'160','gasoline',34000,38000);
  perform seed_vehicle('Bajaj','Dominar 250','motorcycle','Dominar',2023,'250','gasoline',28000,32000);
  perform seed_vehicle('Bajaj','Pulsar N250','motorcycle','N250',2024,'250','gasoline',30000,34000);
  perform seed_vehicle('Bajaj','Avenger 220','motorcycle','Cruise',2023,'220','gasoline',30000,34000);

  -- Haojue
  perform seed_vehicle('Haojue','DR 160','motorcycle','DR',2022,'160','gasoline',37000,41000);
  perform seed_vehicle('Haojue','DR 300','motorcycle','DR',2022,'300','gasoline',28000,32000);
  perform seed_vehicle('Haojue','Nex 125','motorcycle','Nex',2021,'125','gasoline',44000,46000);
  perform seed_vehicle('Haojue','DK 160','motorcycle','DK',2023,'160','gasoline',37000,41000);

  -- Dafra
  perform seed_vehicle('Dafra','Riva 150','motorcycle','Riva',2018,'150','gasoline',38000,41000);
  perform seed_vehicle('Dafra','Kansas 150','motorcycle','Kansas',2015,'150','gasoline',36000,40000);
  perform seed_vehicle('Dafra','Kansas 250','motorcycle','Kansas',2016,'250','gasoline',30000,34000);
  perform seed_vehicle('Dafra','Speed 150','motorcycle','Speed',2014,'150','gasoline',37000,41000);
  perform seed_vehicle('Dafra','Next 250','motorcycle','Next',2018,'250','gasoline',28000,32000);
  perform seed_vehicle('Dafra','Cityclass 200','motorcycle','Cityclass',2016,'200','gasoline',30000,34000);
  perform seed_vehicle('Dafra','Apache RTR 200','motorcycle','RTR 4V',2021,'200','gasoline',31000,35000);

  -- Shineray
  perform seed_vehicle('Shineray','SHI 175','motorcycle','SHI',2023,'175','gasoline',35000,39000);
  perform seed_vehicle('Shineray','Discover 200','motorcycle','Discover',2022,'200','gasoline',32000,36000);
  perform seed_vehicle('Shineray','New Cross 150','motorcycle','New Cross',2021,'150','gasoline',36000,40000);
  perform seed_vehicle('Shineray','Jet 125','motorcycle','Jet',2022,'125','gasoline',44000,46000);

  -- Kasinski
  perform seed_vehicle('Kasinski','Mirage 150','motorcycle','Mirage',2013,'150','gasoline',34000,38000);
  perform seed_vehicle('Kasinski','Comet 250','motorcycle','GT',2012,'250','gasoline',28000,32000);
  perform seed_vehicle('Kasinski','Seta 125','motorcycle','Seta',2011,'125','gasoline',42000,46000);

  -- Traxx
  perform seed_vehicle('Traxx','Star 50','motorcycle','Star',2015,'50','gasoline',52000,55000);
  perform seed_vehicle('Traxx','Work 125','motorcycle','Work',2016,'125','gasoline',42000,46000);
  perform seed_vehicle('Traxx','JH 125','motorcycle','JH',2014,'125','gasoline',43000,47000);

  -- Sundown
  perform seed_vehicle('Sundown','Web 100','motorcycle','Web',2010,'100','gasoline',48000,52000);
  perform seed_vehicle('Sundown','Hunter 90','motorcycle','Hunter',2009,'90','gasoline',50000,54000);
  perform seed_vehicle('Sundown','Max 125','motorcycle','Max SED',2011,'125','gasoline',42000,46000);

  -- Kymco
  perform seed_vehicle('Kymco','Agility 125','motorcycle','Agility',2022,'125','gasoline',40000,43000);
  perform seed_vehicle('Kymco','Like 150','motorcycle','Like',2022,'150','gasoline',37000,40000);
  perform seed_vehicle('Kymco','People 150','motorcycle','People S',2022,'150','gasoline',36000,39000);

  -- Voltz
  perform seed_vehicle('Voltz','EV1','motorcycle','EV1 Sport',2023,'EV','electric',null,null);
  perform seed_vehicle('Voltz','EVS','motorcycle','EVS Work',2023,'EV','electric',null,null);
  perform seed_vehicle('Voltz','EV09','motorcycle','EV09',2024,'EV','electric',null,null);

  -- Mais anos e acabamentos nos modelos que ja existem. Um motorista que
  -- acha o modelo e nao acha o ano do seu volta para o campo livre igual a
  -- quem nao achou o modelo, e perde o consumo de referencia do mesmo jeito.
  -- ------------------------------- carros, mais anos e acabamentos ---
  perform seed_vehicle('Chevrolet','Onix','car','1.0 LT 2019',2019,'1.0','gasoline',12000,14600);
  perform seed_vehicle('Chevrolet','Onix','car','1.0 Turbo LTZ',2022,'1.0 T','gasoline',11600,14900);
  perform seed_vehicle('Chevrolet','Prisma','car','1.4 LT 2016',2016,'1.4','gasoline',10700,13400);
  perform seed_vehicle('Chevrolet','Spin','car','1.8 LT 7 lugares',2018,'1.8','gasoline',9200,11700);
  perform seed_vehicle('Fiat','Argo','car','1.0 Drive 2022',2022,'1.0','gasoline',12000,14600);
  perform seed_vehicle('Fiat','Argo','car','1.3 Trekking',2024,'1.3','gasoline',11100,13800);
  perform seed_vehicle('Fiat','Cronos','car','1.3 Drive 2023',2023,'1.3','gasoline',11300,14000);
  perform seed_vehicle('Fiat','Mobi','car','1.0 Like 2019',2019,'1.0','gasoline',12900,15400);
  perform seed_vehicle('Fiat','Mobi','car','1.0 Trekking 2024',2024,'1.0','gasoline',12400,14900);
  perform seed_vehicle('Fiat','Strada','car','1.3 Endurance CD',2023,'1.3','gasoline',10300,13100);
  perform seed_vehicle('Fiat','Strada','car','1.4 Freedom CS',2020,'1.4','gasoline',9800,12600);
  perform seed_vehicle('Volkswagen','Gol','car','1.0 G6',2014,'1.0','gasoline',11600,14200);
  perform seed_vehicle('Volkswagen','Gol','car','1.6 Comfortline',2016,'1.6','gasoline',10300,13300);
  perform seed_vehicle('Volkswagen','Voyage','car','1.6 Comfortline',2016,'1.6','gasoline',10200,13200);
  perform seed_vehicle('Volkswagen','Virtus','car','1.0 TSI Comfortline',2020,'1.0 T','gasoline',11400,14700);
  perform seed_vehicle('Volkswagen','Polo','car','1.0 MPI 2019',2019,'1.0','gasoline',11800,14500);
  perform seed_vehicle('Hyundai','HB20','car','1.0 Vision 2020',2020,'1.0','gasoline',12200,14800);
  perform seed_vehicle('Hyundai','HB20','car','1.0 Sense 2024',2024,'1.0','gasoline',12400,15000);
  perform seed_vehicle('Hyundai','HB20S','car','1.0 Vision 2020',2020,'1.0','gasoline',12000,14700);
  perform seed_vehicle('Hyundai','HB20S','car','1.0 Turbo Platinum',2023,'1.0 T','gasoline',11100,14300);
  perform seed_vehicle('Hyundai','Creta','car','1.6 Smart 2019',2019,'1.6','gasoline',9800,12600);
  perform seed_vehicle('Renault','Kwid','car','1.0 Zen 2022',2022,'1.0','gasoline',13100,15500);
  perform seed_vehicle('Renault','Kwid','car','1.0 Outsider',2024,'1.0','gasoline',12900,15300);
  perform seed_vehicle('Renault','Sandero','car','1.0 Zen 2020',2020,'1.0','gasoline',11800,14300);
  perform seed_vehicle('Renault','Logan','car','1.0 Zen 2021',2021,'1.0','gasoline',11600,14100);
  perform seed_vehicle('Renault','Duster','car','1.6 Expression',2016,'1.6','gasoline',9400,12100);
  perform seed_vehicle('Toyota','Corolla','car','1.8 XEi 2016',2016,'1.8','gasoline',10600,13800);
  perform seed_vehicle('Toyota','Corolla','car','2.0 Altis 2019',2019,'2.0','gasoline',10200,13700);
  perform seed_vehicle('Toyota','Etios','car','1.5 XLS 2017',2017,'1.5','gasoline',11300,14100);
  perform seed_vehicle('Toyota','Yaris','car','1.5 XLS 2023',2023,'1.5','gasoline',11300,14200);
  perform seed_vehicle('Honda','Civic','car','1.8 LXS',2014,'1.8','gasoline',10400,13800);
  perform seed_vehicle('Honda','Civic','car','2.0 EXL 2023',2023,'2.0','gasoline',10200,13600);
  perform seed_vehicle('Honda','City','car','1.5 DX',2016,'1.5','gasoline',11300,14000);
  perform seed_vehicle('Honda','Fit','car','1.5 EX 2015',2015,'1.5','gasoline',11400,13900);
  perform seed_vehicle('Honda','HR-V','car','1.8 LX 2018',2018,'1.8','gasoline',10000,12900);
  perform seed_vehicle('Nissan','Versa','car','1.6 S 2016',2016,'1.6','gasoline',10600,13600);
  perform seed_vehicle('Nissan','March','car','1.0 S 2016',2016,'1.0','gasoline',12000,14500);
  perform seed_vehicle('Nissan','Kicks','car','1.6 SL 2020',2020,'1.6','gasoline',10000,12900);
  perform seed_vehicle('Ford','Ka','car','1.0 SE 2016',2016,'1.0','gasoline',11900,14500);
  perform seed_vehicle('Ford','EcoSport','car','1.6 Freestyle',2016,'1.6','gasoline',9400,12200);
  perform seed_vehicle('Chevrolet','Cobalt','car','1.8 LTZ 2016',2016,'1.8','gasoline',9600,12300);
  perform seed_vehicle('Jeep','Renegade','car','1.3 Turbo Longitude 2024',2024,'1.3 T','gasoline',10000,13200);
  perform seed_vehicle('Jeep','Compass','car','2.0 Diesel Longitude',2021,'2.0','diesel',10600,13800);
  perform seed_vehicle('Peugeot','208','car','1.0 Like',2023,'1.0','gasoline',11600,14400);
  perform seed_vehicle('Citroën','C3','car','1.0 Live 2022',2022,'1.0','gasoline',11800,14500);

  -- -------------------------------- motos, mais anos e acabamentos ---
  perform seed_vehicle('Honda','CG 160 Fan','motorcycle','Fan 2022',2022,'160','gasoline',40500,45500);
  perform seed_vehicle('Honda','CG 160 Titan','motorcycle','Titan 2022',2022,'160','gasoline',39000,44000);
  perform seed_vehicle('Honda','CG 160 Cargo','motorcycle','Cargo 2022',2022,'160','gasoline',38000,43000);
  perform seed_vehicle('Honda','Biz 125','motorcycle','ES 2019',2019,'125','gasoline',44500,47500);
  perform seed_vehicle('Honda','Pop 110i','motorcycle','Pop 2019',2019,'110','gasoline',50000,52000);
  perform seed_vehicle('Honda','Bros 160','motorcycle','ESDD 2023',2023,'160','gasoline',37000,41000);
  perform seed_vehicle('Honda','XRE 300','motorcycle','ABS 2022',2022,'300','gasoline',29000,33000);
  perform seed_vehicle('Honda','PCX 160','motorcycle','DLX 2024',2024,'160','gasoline',36000,38000);
  perform seed_vehicle('Honda','CB 300F','motorcycle','Twister 2023',2023,'300','gasoline',29500,33500);
  perform seed_vehicle('Yamaha','Factor 150','motorcycle','ED 2024',2024,'150','gasoline',39500,43500);
  perform seed_vehicle('Yamaha','Fazer 250','motorcycle','ABS 2023',2023,'250','gasoline',30500,34500);
  perform seed_vehicle('Yamaha','NMax 160','motorcycle','ABS 2024',2024,'160','gasoline',36500,38500);
  perform seed_vehicle('Yamaha','Crosser 150','motorcycle','S 2024',2024,'150','gasoline',35500,39500);
  perform seed_vehicle('Yamaha','Lander 250','motorcycle','ABS 2023',2023,'250','gasoline',30000,34000);
  perform seed_vehicle('Yamaha','MT-03','motorcycle','ABS 2023',2023,'320','gasoline',26000,30000);
  perform seed_vehicle('Suzuki','Yes 125','motorcycle','SE',2012,'125','gasoline',44000,48000);
  perform seed_vehicle('Suzuki','Burgman 125','motorcycle','Burgman 2023',2023,'125','gasoline',38000,40000);
  perform seed_vehicle('Haojue','DK 150','motorcycle','DK 2019',2019,'150','gasoline',38000,42000);
  perform seed_vehicle('Dafra','NH 190','motorcycle','NH 2023',2023,'190','gasoline',33000,37000);
  perform seed_vehicle('Royal Enfield','Meteor 350','motorcycle','Fireball',2024,'350','gasoline',28000,32000);
  perform seed_vehicle('Royal Enfield','Hunter 350','motorcycle','Rebel',2024,'350','gasoline',29000,33000);
  perform seed_vehicle('Royal Enfield','Himalayan','motorcycle','Sleet 411',2021,'410','gasoline',26000,30000);
  perform seed_vehicle('Kawasaki','Ninja 400','motorcycle','KRT 2023',2023,'400','gasoline',24000,28000);
  perform seed_vehicle('Bajaj','Dominar 400','motorcycle','Dominar 2024',2024,'400','gasoline',25000,29000);
  perform seed_vehicle('Shineray','XY 150','motorcycle','Worker 2023',2023,'150','gasoline',38000,42000);
  perform seed_vehicle('Mottu','Pop 110i','motorcycle','Pop 2024',2024,'110','gasoline',50000,52000);
end;
$$;
