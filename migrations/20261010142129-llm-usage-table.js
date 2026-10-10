"use strict";

var dbm;
var type;
var seed;

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
exports.setup = function (options, seedLink) {
    dbm = options.dbmigrate;
    type = dbm.dataType;
    seed = seedLink;
};

exports.up = function (db) {
    return db.runSql(`
        CREATE TABLE IF NOT EXISTS llm_usage (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            review_id BIGINT UNSIGNED NOT NULL,
            pipeline_step VARCHAR(32) NOT NULL,
            model VARCHAR(128) NOT NULL,
            provider VARCHAR(32) NOT NULL,
            llm_calls INT UNSIGNED NOT NULL,
            total_tokens INT UNSIGNED NOT NULL,
            latency_ms INT UNSIGNED NOT NULL,
            cost DECIMAL(12, 6) NULL,

            KEY idx_usage_review (review_id),
            CONSTRAINT fk_usage_review FOREIGN KEY (review_id)
                REFERENCES reviews (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
};

exports.down = function (db) {
    return db.runSql("DROP TABLE IF EXISTS llm_usage");
};

exports._meta = {
    version: 1,
};
