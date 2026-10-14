-- When each sales order is planned to reach the customer. Orders that existed before get two days after
-- their order date, the same lead time the demo data uses; new orders choose a date when they're placed.
alter table sales_orders add column planned_delivery_date date;
update sales_orders set planned_delivery_date = order_date + 2;
