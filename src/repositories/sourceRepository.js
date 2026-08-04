const pool = require("../config/database")
const SOURCE_METADATA = {
    zatca_einvoicing_regulation: { slug: "zatca_einvoicing_regulation", code: "ZATCA_EINVOICING_REGULATION", type: "regulation", issuer: "Zakat, Tax and Customs Authority (ZATCA)" },
    zatca_implementation_resolution: { slug: "zatca_implementation_resolution", code: "ZATCA_IMPLEMENTATION_RESOLUTION", type: "regulation", issuer: "Zakat, Tax and Customs Authority (ZATCA)" },
    zatca_guidelines: { slug: "zatca_guidelines", code: "ZATCA_GUIDELINES", type: "guidance", issuer: "Zakat, Tax and Customs Authority (ZATCA)" },
    zatca_vat_agreement: { slug: "zatca_vat_agreement", code: "ZATCA_VAT_AGREEMENT", type: "regulation", issuer: "Zakat, Tax and Customs Authority (ZATCA)" },
    labor: { slug: "labor", code: "LABOR_LAW", type: "statute", issuer: "Ministry of Human Resources and Social Development (HRSD)" },
    companies: { slug: "companies", code: "COMPANIES_LAW", type: "statute", issuer: "Ministry of Commerce" },
    pdpl: { slug: "pdpl", code: "PDPL", type: "statute", issuer: "Saudi Data & AI Authority (SDAIA)" },
    sama: { slug: "sama", code: "SAMA_CIRCULAR", type: "regulation", issuer: "Saudi Central Bank (SAMA)" },
    cma: { slug: "cma", code: "CMA_LAW", type: "statute", issuer: "Capital Market Authority (CMA)" },
    nca: { slug: "nca", code: "NCA_ECC", type: "regulation", issuer: "National Cybersecurity Authority (NCA)" },
    misa: { slug: "misa", code: "MISA_INVESTMENT_LAW", type: "statute", issuer: "Ministry of Investment (MISA)" }
}
function getSourceMetadata(sourceName) {
    return SOURCE_METADATA[sourceName] || {
        slug: sourceName,
        code: sourceName.toUpperCase(),
        type: "regulation",
        issuer: "Unknown"
    }
}
async function saveSource(source) {
    const meta = getSourceMetadata(source.name)
    const query = `
        INSERT INTO sources (
            slug,
            code,
            type,
            issuer,
            jurisdiction,
            language_primary
        )
        VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (slug)
        DO UPDATE SET
            code = EXCLUDED.code,
                           type = EXCLUDED.type,
                           issuer = EXCLUDED.issuer,
                           updated_at = NOW()
                           RETURNING *;
    `
    const values = [
        meta.slug,
        meta.code,
        meta.type,
        meta.issuer,
        "SA",
        source.language || "unknown"
    ]
    const { rows } = await pool.query(query, values);
    return rows[0];
}
module.exports = {
    saveSource
}