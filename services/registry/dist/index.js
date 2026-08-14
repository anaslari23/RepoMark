import express from 'express';
import { SQLiteRegistryStore } from './db.js';
import path from 'node:path';
import fs from 'node:fs';
const app = express();
app.use(express.json());
// Determine DB path (use a local file if running as a server, memory for tests)
const dataDir = process.env.REPOMARK_REGISTRY_DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'registry.sqlite');
const store = new SQLiteRegistryStore(dbPath);
app.post('/api/v1/records', (req, res) => {
    const { digest, signature, issuerId, metadata } = req.body;
    if (!digest || !signature || !issuerId || !metadata) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        store.insertRecord({
            digest,
            signature,
            issuerId,
            metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata)
        });
        res.status(201).json({ status: 'success', digest });
    }
    catch (err) {
        if (err.message?.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'Record already exists' });
        }
        console.error('Error inserting record:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/v1/records/:digest', (req, res) => {
    const { digest } = req.params;
    try {
        const record = store.getRecord(digest);
        if (!record) {
            return res.status(404).json({ error: 'Record not found' });
        }
        // Parse metadata back to JSON object if it's stored as string
        let parsedMetadata = record.metadata;
        try {
            parsedMetadata = JSON.parse(record.metadata);
        }
        catch {
            // Keep as string if parsing fails
        }
        res.status(200).json({
            ...record,
            metadata: parsedMetadata
        });
    }
    catch (err) {
        console.error('Error retrieving record:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`RepoMark Registry Service listening on port ${PORT}`);
});
//# sourceMappingURL=index.js.map