-- Wine since 23 February 2024: import duty removed (HS 22.04) and excise cut to 5% of the suggested retail
-- price + ฿1,000 per litre of pure alcohol (was 10% + ฿1,500). Only rates still at the earlier defaults change.
update duty_rates set duty_percent = 0 where hs_prefix like '2204%' and duty_percent in (54, 60);
update tax_settings
set excise_rates = (
  select jsonb_agg(case when r->>'kind' = 'wine' and (r->>'valuePercent')::numeric = 10 and (r->>'perLitreAlcohol')::numeric = 1500
                        then jsonb_build_object('kind', 'wine', 'valuePercent', 5, 'perLitreAlcohol', 1000) else r end)
  from jsonb_array_elements(excise_rates) r
);
