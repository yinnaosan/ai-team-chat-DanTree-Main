-- Track B Move 4: Add last_valuation column to watch_items for valuation_shift delta persistence
ALTER TABLE `watch_items` ADD `last_valuation` decimal(8,4);
