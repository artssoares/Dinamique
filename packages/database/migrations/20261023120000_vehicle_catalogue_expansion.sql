-- ============================================================================
-- Ampliação do catálogo de carros (§32).
--
-- O cadastro é cascata: marca → modelo → versão. Quem não acha o carro cai no
-- campo livre "Não encontrei meu veículo", e aí o app perde o consumo de
-- referência: o motorista começa sem nota nem custo por km até abastecer três
-- vezes. Então o catálogo faltando é perda de dado, não só de conforto.
--
-- Esta migration só acrescenta. `seed_vehicle` é idempotente (todos os inserts
-- têm `on conflict do nothing`), portanto rodar de novo não duplica nada e não
-- mexe no que já está lá.
--
-- Consumo em metros por litro (10,8 km/l = 10800), como no resto do catálogo.
-- São valores de referência por classe de motor, não medição individual: o
-- consumo real do motorista substitui isso depois de alguns abastecimentos
-- (§31). Onde o número seria chute grosso (elétricos, que não se medem em
-- km/l) fica `null`, e a interface simplesmente não mostra.
--
-- Flex entra como 'gasoline': o enum `fuel_type` não tem flex e a gasolina é
-- a referência de consumo que o app usa.
-- ============================================================================

do $$
begin
  -- ---------------------------------------------------------- Chevrolet ----
  perform seed_vehicle('Chevrolet','Blazer','car','2.2 DLX',1998,'2.2','gasoline',8500,11000);
  perform seed_vehicle('Chevrolet','Blazer','car','4.3 V6 Executive',2000,'4.3','gasoline',6500,9000);
  perform seed_vehicle('Chevrolet','Captiva','car','2.4 Sport',2013,'2.4','gasoline',8600,11600);
  perform seed_vehicle('Chevrolet','Camaro','car','6.2 SS',2017,'6.2','gasoline',6000,9500);
  perform seed_vehicle('Chevrolet','Chevette','car','1.6 SL',1993,'1.6','gasoline',8800,11500);
  perform seed_vehicle('Chevrolet','Kadett','car','1.8 GSi',1994,'1.8','gasoline',8500,11200);
  perform seed_vehicle('Chevrolet','Monza','car','1.8 SL/E',1993,'1.8','gasoline',8600,11300);
  perform seed_vehicle('Chevrolet','Omega','car','2.2 GLS',1998,'2.2','gasoline',7800,10800);
  perform seed_vehicle('Chevrolet','Opala','car','2.5 Comodoro',1990,'2.5','gasoline',6800,9500);
  perform seed_vehicle('Chevrolet','Ipanema','car','1.8 SL',1995,'1.8','gasoline',8500,11200);
  perform seed_vehicle('Chevrolet','Sonic','car','1.6 LTZ',2013,'1.6','gasoline',9800,12800);
  perform seed_vehicle('Chevrolet','Cruze Sport6','car','1.4 Turbo LT',2020,'1.4 T','gasoline',10400,13600);
  perform seed_vehicle('Chevrolet','Joy Plus','car','1.0 Joy',2020,'1.0','gasoline',12400,15200);
  perform seed_vehicle('Chevrolet','D20','car','4.0 Custom',1995,'4.0','diesel',7500,9800);
  perform seed_vehicle('Chevrolet','Silverado','car','4.1 Conquest',1998,'4.1','gasoline',6000,8500);

  -- --------------------------------------------------------------- Fiat ----
  perform seed_vehicle('Fiat','Tempra','car','2.0 16V',1997,'2.0','gasoline',8200,11000);
  perform seed_vehicle('Fiat','Tipo','car','1.6 IE',1996,'1.6','gasoline',8800,11500);
  perform seed_vehicle('Fiat','Marea','car','2.0 20V HLX',2000,'2.0','gasoline',8000,11000);
  perform seed_vehicle('Fiat','Marea Weekend','car','1.8 SX',2002,'1.8','gasoline',8600,11400);
  perform seed_vehicle('Fiat','Brava','car','1.6 SX',2001,'1.6','gasoline',9000,11800);
  perform seed_vehicle('Fiat','Stilo','car','1.8 8V',2007,'1.8','gasoline',8600,11300);
  perform seed_vehicle('Fiat','Premio','car','1.5 CS',1994,'1.5','gasoline',9500,12000);
  perform seed_vehicle('Fiat','Elba','car','1.5 Weekend',1994,'1.5','gasoline',9400,11900);
  perform seed_vehicle('Fiat','Duna','car','1.6 SX',1994,'1.6','gasoline',9200,11800);
  perform seed_vehicle('Fiat','147','car','1.3 L',1986,'1.3','gasoline',9000,11500);
  perform seed_vehicle('Fiat','Oggi','car','1.3 CS',1984,'1.3','gasoline',9000,11500);
  perform seed_vehicle('Fiat','Freemont','car','2.4 Precision',2014,'2.4','gasoline',8000,11000);
  perform seed_vehicle('Fiat','Titano','car','2.2 Ranch',2025,'2.2','diesel',9000,12000);

  -- ------------------------------------------------------- Volkswagen -----
  perform seed_vehicle('Volkswagen','Santana','car','2.0 MI',1998,'2.0','gasoline',8600,11800);
  perform seed_vehicle('Volkswagen','Quantum','car','2.0 GLS',1997,'2.0','gasoline',8400,11500);
  perform seed_vehicle('Volkswagen','Logus','car','1.8 CL',1996,'1.8','gasoline',8800,11600);
  perform seed_vehicle('Volkswagen','Pointer','car','1.8 GLi',1996,'1.8','gasoline',8800,11600);
  perform seed_vehicle('Volkswagen','Apollo','car','1.8 GL',1992,'1.8','gasoline',8700,11500);
  perform seed_vehicle('Volkswagen','Fusca','car','1.6 1600',1996,'1.6','gasoline',9000,11000);
  perform seed_vehicle('Volkswagen','Brasília','car','1.6',1982,'1.6','gasoline',8500,10500);
  perform seed_vehicle('Volkswagen','Polo Track','car','1.0 MPI',2023,'1.0','gasoline',11800,14500);
  perform seed_vehicle('Volkswagen','Tera','car','1.0 TSI',2025,'1.0 T','gasoline',12000,15000);

  -- --------------------------------------------------------------- Ford ----
  perform seed_vehicle('Ford','Escort','car','1.8 GL',1996,'1.8','gasoline',8900,11800);
  perform seed_vehicle('Ford','Verona','car','1.8 GLX',1995,'1.8','gasoline',8900,11800);
  perform seed_vehicle('Ford','Del Rey','car','1.6 Ghia',1990,'1.6','gasoline',8600,11000);
  perform seed_vehicle('Ford','Pampa','car','1.8 L',1996,'1.8','gasoline',8700,11200);
  perform seed_vehicle('Ford','Focus Sedan','car','2.0 SE',2015,'2.0','gasoline',9200,12500);
  perform seed_vehicle('Ford','Mondeo','car','2.0 CLX',1998,'2.0','gasoline',8200,11500);
  perform seed_vehicle('Ford','Maverick','car','2.5 Lariat Híbrida',2023,'2.5 H','gasoline',14000,13000);
  perform seed_vehicle('Ford','Mustang','car','5.0 GT',2018,'5.0','gasoline',5800,9500);
  perform seed_vehicle('Ford','Bronco Sport','car','2.0 Wildtrak',2021,'2.0 T','gasoline',8200,11200);
  perform seed_vehicle('Ford','Transit','car','2.2 Furgão',2015,'2.2','diesel',8000,10500);
  perform seed_vehicle('Ford','F-250','car','4.2 XLT',2005,'4.2','diesel',7500,10000);
  perform seed_vehicle('Ford','F-1000','car','3.9 Super Série',1996,'3.9','diesel',7800,10200);
  perform seed_vehicle('Ford','F-4000','car','3.9 Turbo',2010,'3.9','diesel',6500,8500);

  -- ------------------------------------------------------------- Toyota ----
  perform seed_vehicle('Toyota','Bandeirante','car','3.7 Diesel',1994,'3.7','diesel',7000,9000);
  perform seed_vehicle('Toyota','Land Cruiser Prado','car','3.0 Diesel',2005,'3.0','diesel',7500,10000);

  -- ------------------------------------------------------------ Hyundai ----
  perform seed_vehicle('Hyundai','HR','car','2.5 Baú',2020,'2.5','diesel',8500,11000);
  perform seed_vehicle('Hyundai','Veloster','car','1.6 GDI',2013,'1.6','gasoline',9500,12800);
  perform seed_vehicle('Hyundai','Sonata','car','2.4 GLS',2012,'2.4','gasoline',8600,12000);
  perform seed_vehicle('Hyundai','Vera Cruz','car','3.0 V6',2010,'3.0','diesel',7800,10500);

  -- ------------------------------------------------------------ Renault ----
  perform seed_vehicle('Renault','Twingo','car','1.0 Alizé',2000,'1.0','gasoline',11500,13800);
  perform seed_vehicle('Renault','19','car','1.8 RT',1996,'1.8','gasoline',8800,11800);

  -- ------------------------------------------------------------ Peugeot ----
  perform seed_vehicle('Peugeot','106','car','1.6 Soleil',2000,'1.6','gasoline',10000,12800);
  perform seed_vehicle('Peugeot','405','car','1.8 GL',1996,'1.8','gasoline',8800,11800);
  perform seed_vehicle('Peugeot','5008','car','1.6 THP Griffe',2018,'1.6 T','gasoline',8800,12000);
  perform seed_vehicle('Peugeot','Expert','car','1.6 HDi Furgão',2019,'1.6','diesel',9500,12000);
  perform seed_vehicle('Peugeot','Hoggar','car','1.4 XR',2012,'1.4','gasoline',10200,13000);

  -- ------------------------------------------------------------ Citroën ----
  perform seed_vehicle('Citroën','C4 Pallas','car','2.0 Exclusive',2012,'2.0','gasoline',8600,12000);
  perform seed_vehicle('Citroën','C5','car','2.0 Exclusive',2010,'2.0','gasoline',8400,11800);
  perform seed_vehicle('Citroën','Xsara','car','1.6 GLX',2000,'1.6','gasoline',9500,12500);
  perform seed_vehicle('Citroën','ZX','car','1.8 Avantage',1997,'1.8','gasoline',9000,12000);
  perform seed_vehicle('Citroën','Jumpy','car','1.6 HDi Furgão',2019,'1.6','diesel',9500,12000);
  perform seed_vehicle('Citroën','Jumper','car','2.3 Furgão',2019,'2.3','diesel',8000,10500);

  -- --------------------------------------------------------------- Jeep ----
  perform seed_vehicle('Jeep','Wrangler','car','2.0 Turbo Sport',2019,'2.0 T','gasoline',7800,10800);
  perform seed_vehicle('Jeep','Gladiator','car','3.6 Overland',2021,'3.6','gasoline',6500,9500);

  -- ---------------------------------------------------------------- Kia ----
  perform seed_vehicle('Kia','Mohave','car','3.0 CRDi',2013,'3.0','diesel',7000,10000);
  perform seed_vehicle('Kia','Niro','car','1.6 Híbrido',2020,'1.6 H','gasoline',16000,15000);

  -- ------------------------------------------------------------- Suzuki ----
  perform seed_vehicle('Suzuki','Grand Vitara','car','2.0 4x4',2014,'2.0','gasoline',8500,11500);
  perform seed_vehicle('Suzuki','SX4','car','2.0 AWD',2012,'2.0','gasoline',8600,11800);

  -- ---------------------------------------------------- marcas premium ----
  perform seed_vehicle('Audi','A1','car','1.4 TFSI',2012,'1.4 T','gasoline',10500,13800);
  perform seed_vehicle('Audi','A5','car','2.0 TFSI',2019,'2.0 T','gasoline',9200,12800);
  perform seed_vehicle('Audi','Q5','car','2.0 TFSI',2019,'2.0 T','gasoline',8600,12000);
  perform seed_vehicle('Audi','Q7','car','3.0 TFSI',2018,'3.0 T','gasoline',7000,10500);

  perform seed_vehicle('BMW','118i','car','1.5 Turbo',2019,'1.5 T','gasoline',10200,13500);
  perform seed_vehicle('BMW','X2','car','2.0 sDrive20i',2020,'2.0 T','gasoline',9200,12800);
  perform seed_vehicle('BMW','X4','car','2.0 xDrive30i',2020,'2.0 T','gasoline',8500,12000);
  perform seed_vehicle('BMW','X5','car','3.0 xDrive30d',2020,'3.0','diesel',8000,11500);

  perform seed_vehicle('Mercedes-Benz','B200','car','1.6 Turbo',2015,'1.6 T','gasoline',9500,12800);
  perform seed_vehicle('Mercedes-Benz','CLA200','car','1.6 Turbo',2019,'1.6 T','gasoline',9800,13200);
  perform seed_vehicle('Mercedes-Benz','GLC220','car','2.1 d',2019,'2.1','diesel',8500,12000);

  perform seed_vehicle('Volvo','XC90','car','2.0 T8',2020,'2.0 H','gasoline',9000,12000);
  perform seed_vehicle('Volvo','S60','car','2.0 T5',2019,'2.0 T','gasoline',9200,12800);
  perform seed_vehicle('Volvo','V40','car','2.0 T4',2018,'2.0 T','gasoline',9500,13000);

  perform seed_vehicle('Land Rover','Range Rover Evoque','car','2.0 Prestige',2015,'2.0 T','gasoline',8000,11500);
  perform seed_vehicle('Land Rover','Discovery Sport','car','2.0 SE',2019,'2.0 T','gasoline',8200,11500);
  perform seed_vehicle('Land Rover','Discovery','car','3.0 HSE',2018,'3.0','diesel',7500,10800);
  perform seed_vehicle('Land Rover','Defender','car','2.0 S',2021,'2.0 T','gasoline',7500,10500);
  perform seed_vehicle('Land Rover','Freelander','car','2.2 SD4',2013,'2.2','diesel',8000,11000);

  perform seed_vehicle('Mini','Cooper','car','1.5 Turbo',2019,'1.5 T','gasoline',10500,14000);
  perform seed_vehicle('Mini','Countryman','car','2.0 S',2020,'2.0 T','gasoline',9200,12800);

  perform seed_vehicle('Porsche','Macan','car','2.0 Turbo',2020,'2.0 T','gasoline',8200,11500);
  perform seed_vehicle('Porsche','Cayenne','car','3.0 V6',2020,'3.0 T','gasoline',7000,10500);

  perform seed_vehicle('Lexus','ES 300h','car','2.5 Híbrido',2020,'2.5 H','gasoline',14000,14500);
  perform seed_vehicle('Lexus','NX 350h','car','2.5 Híbrido',2022,'2.5 H','gasoline',13000,13500);
  perform seed_vehicle('Lexus','UX 250h','car','2.0 Híbrido',2021,'2.0 H','gasoline',14500,14000);
  perform seed_vehicle('Lexus','RX 450h','car','3.5 Híbrido',2020,'3.5 H','gasoline',10000,11500);

  -- ----------------------------------------------- picapes e utilitários ---
  perform seed_vehicle('Dodge','Journey','car','3.6 RT',2013,'3.6','gasoline',7000,10500);
  perform seed_vehicle('Dodge','Dakota','car','3.9 Sport',2001,'3.9','gasoline',6500,9000);
  perform seed_vehicle('RAM','Rampage','car','2.0 Rebel',2024,'2.0','diesel',9000,12500);
  perform seed_vehicle('RAM','1500','car','5.7 Laramie',2020,'5.7','gasoline',5500,8500);
  perform seed_vehicle('RAM','2500','car','6.7 Laramie',2020,'6.7','diesel',6500,9500);
  perform seed_vehicle('RAM','3500','car','6.7 Laramie',2021,'6.7','diesel',6200,9000);
  perform seed_vehicle('Chrysler','PT Cruiser','car','2.4 Limited',2008,'2.4','gasoline',8000,11000);
  perform seed_vehicle('Chrysler','300C','car','5.7 V8',2008,'5.7','gasoline',5800,9000);
  perform seed_vehicle('Troller','T4','car','3.0 Turbodiesel',2014,'3.0','diesel',7500,10000);

  -- ------------------------------------------------------ outras marcas ----
  perform seed_vehicle('Subaru','Impreza','car','2.0 AWD',2012,'2.0','gasoline',8600,11800);
  perform seed_vehicle('Subaru','Forester','car','2.0 XS',2014,'2.0','gasoline',8200,11500);
  perform seed_vehicle('Subaru','XV','car','2.0 AWD',2018,'2.0','gasoline',8600,11800);
  perform seed_vehicle('SsangYong','Actyon','car','2.0 Sports',2012,'2.0','diesel',8500,11500);
  perform seed_vehicle('SsangYong','Korando','car','2.0 GLS',2013,'2.0','diesel',8800,12000);
  perform seed_vehicle('Lifan','530','car','1.5 Talent',2015,'1.5','gasoline',10500,13000);
  perform seed_vehicle('Lifan','X60','car','1.8 VIP',2015,'1.8','gasoline',9000,11800);
  perform seed_vehicle('Lifan','320','car','1.3 Elite',2013,'1.3','gasoline',11000,13500);
  perform seed_vehicle('Caoa Chery','Arrizo 5','car','1.5 RX',2018,'1.5','gasoline',10500,13500);
  perform seed_vehicle('Caoa Chery','Face','car','1.3 Face',2012,'1.3','gasoline',10800,13200);
  perform seed_vehicle('Caoa Chery','Tiggo','car','2.0 Tiggo',2012,'2.0','gasoline',8500,11500);
  perform seed_vehicle('GWM','Tank 300','car','2.0 Turbo',2024,'2.0 T','gasoline',7500,10000);
  perform seed_vehicle('BYD','Shark','car','1.5 GL',2025,'1.5 T','gasoline',8000,11000);
  perform seed_vehicle('JAC','T6','car','2.0 Diesel',2019,'2.0','diesel',9000,12000);
  perform seed_vehicle('Omoda Jaecoo','Omoda 5','car','1.5 Turbo',2025,'1.5 T','gasoline',10000,13000);
  perform seed_vehicle('Omoda Jaecoo','Jaecoo 7','car','1.6 Turbo',2025,'1.6 T','gasoline',9500,12500);

  -- ----------------------------------------------------- carros elétricos --
  -- O tipo 'electric' tinha três opções; quem dirige elétrico caía no campo
  -- livre. Consumo fica null: km/l não descreve elétrico, e inventar número
  -- estragaria a nota do dia (§31).
  perform seed_vehicle('Tesla','Model 3','electric','Performance',2023,'EV','electric',null,null);
  perform seed_vehicle('Tesla','Model Y','electric','Long Range',2023,'EV','electric',null,null);
  perform seed_vehicle('Chevrolet','Bolt EV','electric','Premier',2020,'EV','electric',null,null);
  perform seed_vehicle('Fiat','500e','electric','Icon',2023,'EV','electric',null,null);
  perform seed_vehicle('Volkswagen','ID.4','electric','Pro',2022,'EV','electric',null,null);
  perform seed_vehicle('Volvo','EX30','electric','Plus',2024,'EV','electric',null,null);
  perform seed_vehicle('Volvo','XC40 Recharge','electric','Pure',2022,'EV','electric',null,null);
  perform seed_vehicle('Peugeot','e-208','electric','GT',2022,'EV','electric',null,null);
  perform seed_vehicle('Hyundai','Kona Electric','electric','EV',2021,'EV','electric',null,null);
  perform seed_vehicle('Hyundai','Ioniq 5','electric','EV',2023,'EV','electric',null,null);
  perform seed_vehicle('Kia','Niro EV','electric','EV',2021,'EV','electric',null,null);
  perform seed_vehicle('Kia','EV6','electric','GT-Line',2023,'EV','electric',null,null);
  perform seed_vehicle('BMW','i3','electric','EV',2019,'EV','electric',null,null);
  perform seed_vehicle('Mini','Cooper SE','electric','EV',2021,'EV','electric',null,null);
  perform seed_vehicle('Caoa Chery','iCar','electric','EV',2021,'EV','electric',null,null);
  perform seed_vehicle('JAC','iEV330','electric','EV',2019,'EV','electric',null,null);
  perform seed_vehicle('Geely','EX5','electric','Max',2025,'EV','electric',null,null);
  perform seed_vehicle('Renault','Megane E-Tech','electric','EV',2024,'EV','electric',null,null);
end;
$$;
