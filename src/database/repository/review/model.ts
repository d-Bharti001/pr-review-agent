import { RowDataPacket } from "mysql2";

export interface IReviewRow extends RowDataPacket {
    id: string; // BIGINT as string
    repo: string;
    owner: string;
    pr_number: number;
    head_sha: string;
    delivery_id: string;
    status: string;
    created_at: Date;
}
