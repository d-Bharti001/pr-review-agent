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
        CREATE TABLE IF NOT EXISTS findings (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            review_id BIGINT UNSIGNED NOT NULL,
            category VARCHAR(16) NOT NULL,
            severity VARCHAR(16) NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            suggestion TEXT NOT NULL,
            locations JSON NOT NULL,
            model VARCHAR(128) NOT NULL,
            provider VARCHAR(128) NOT NULL,

            KEY idx_findings_review (review_id),
            CONSTRAINT fk_findings_review FOREIGN KEY (review_id)
                REFERENCES reviews (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
};

exports.down = function (db) {
    return db.runSql("DROP TABLE IF EXISTS findings");
};

exports._meta = {
    version: 1,
};
