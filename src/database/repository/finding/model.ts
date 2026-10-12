import { RowDataPacket } from "mysql2";

export interface IFindingRow extends RowDataPacket {
    id: string; // BIGINT as string
    review_id: string; // BIGINT as string
    category: string;
    severity: string;
    title: string;
    message: string;
    suggestion: string;
    locations: unknown; // JSON
    model: string;
    provider: string;
}
