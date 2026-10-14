-- Each order keeps the stages it has passed through: [{status, at, actor}], oldest first.
-- Orders that existed before this get their current stage, with the time marked as not recorded.

alter table sales_orders add column status_history jsonb not null default '[]';
alter table import_orders add column status_history jsonb not null default '[]';

update sales_orders set status_history = jsonb_build_array(jsonb_build_object(
  'status', coalesce(approval_status, delivery_status),
  'at', null,
  'actor', '{"th": "ระบบ (ข้อมูลเดิม)", "en": "System (earlier data)"}'::jsonb));

update import_orders set status_history = jsonb_build_array(jsonb_build_object(
  'status', case when status = 'pendingApproval' and first_approver is not null and first_approver <> 'null'::jsonb then 'firstApproved' else status end,
  'at', null,
  'actor', '{"th": "ระบบ (ข้อมูลเดิม)", "en": "System (earlier data)"}'::jsonb));
