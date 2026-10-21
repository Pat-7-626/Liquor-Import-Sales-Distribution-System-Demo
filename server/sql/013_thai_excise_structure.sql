-- Import taxes in the structure Customs and Excise use: excise per kind of drink (a % of the suggested retail
-- price before VAT + baht per litre of pure alcohol), Interior Ministry tax and fund levies as a % of the
-- excise; and MFN import duty rates. Replaces the single "baht per ABV-litre" demo rate.

alter table tax_settings
  add column excise_rates      jsonb not null default '[
    {"kind": "spirits", "valuePercent": 20, "perLitreAlcohol": 255},
    {"kind": "wine", "valuePercent": 10, "perLitreAlcohol": 1500},
    {"kind": "beer", "valuePercent": 22, "perLitreAlcohol": 430}
  ]',
  add column local_tax_percent numeric(6,2) not null default 10,
  add column funds_percent     numeric(6,2) not null default 7.5;
alter table tax_settings drop column excise_thb_per_abv_liter;

-- The demo's illustrative duty rates become the MFN rates (only where they were never changed by hand).
update tax_settings set default_duty_percent = 60 where default_duty_percent = 30;
update duty_rates set duty_percent = 60 where hs_prefix like '2208%' and duty_percent = 30;
update duty_rates set duty_percent = 54 where hs_prefix like '2204%' and duty_percent = 60;
update duty_rates set duty_percent = 60 where hs_prefix like '2203%' and duty_percent = 20;

-- A 6-pack is six cans: excise by volume counts all of them.
alter table products add column units_per_pack integer not null default 1 check (units_per_pack between 1 and 100);
update products set units_per_pack = 6 where unit = 'pack' and name ~* '6-?pack';
