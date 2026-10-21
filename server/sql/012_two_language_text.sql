-- Free text kept in Thai and English separately ({"th": …, "en": …}; either may be empty) instead of one
-- string. Existing text is split the way the app splits typed text: "ไทย / English" into its two halves,
-- otherwise into the language it is written in.

create function pg_temp.two_language(t text) returns jsonb language sql immutable as $$
  select case
    when t ~ '^(.*[ก-๛].*)\s+/\s+([^ก-๛]+)$' then jsonb_build_object(
      'th', btrim(regexp_replace(t, '^(.*[ก-๛].*)\s+/\s+([^ก-๛]+)$', '\1')),
      'en', btrim(regexp_replace(t, '^(.*[ก-๛].*)\s+/\s+([^ก-๛]+)$', '\2')))
    when t ~ '[ก-๛]' then jsonb_build_object('th', btrim(t), 'en', '')
    else jsonb_build_object('th', '', 'en', btrim(coalesce(t, '')))
  end
$$;

alter table expenses alter column description drop default;
alter table expenses alter column description type jsonb using pg_temp.two_language(description);

alter table manual_journals alter column memo drop default;
alter table manual_journals alter column memo type jsonb using pg_temp.two_language(memo);

alter table quotations alter column notes drop default;
alter table quotations alter column notes type jsonb using pg_temp.two_language(notes);
alter table quotations alter column notes set default '{"th": "", "en": ""}';

alter table purchase_requests alter column reason drop default;
alter table purchase_requests alter column reason type jsonb using pg_temp.two_language(reason);

alter table ar_reminders alter column note drop default;
alter table ar_reminders alter column note type jsonb using pg_temp.two_language(note);
alter table ar_reminders alter column note set default '{"th": "", "en": ""}';

alter table company alter column bank_name drop default;
alter table company alter column bank_name type jsonb using pg_temp.two_language(bank_name);
alter table company alter column bank_name set default '{"th": "", "en": ""}';
alter table company alter column bank_branch drop default;
alter table company alter column bank_branch type jsonb using pg_temp.two_language(bank_branch);
alter table company alter column bank_branch set default '{"th": "", "en": ""}';
alter table company alter column bank_account_name drop default;
alter table company alter column bank_account_name type jsonb using pg_temp.two_language(bank_account_name);
alter table company alter column bank_account_name set default '{"th": "", "en": ""}';

-- Reversals used to carry their reason in the English half only.
update manual_journals
set memo = jsonb_set(memo, '{th}', to_jsonb((memo->>'th') || ': ' || substring(memo->>'en' from '^Reversal of [^:]+: (.*)$')))
where memo->>'en' ~ '^Reversal of [^:]+: ' and position(':' in memo->>'th') = 0;
