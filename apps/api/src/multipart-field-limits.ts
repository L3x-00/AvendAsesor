// Multer leaves numeric bracket indexes unbounded unless this is set.
// The largest upload DTO accepts 21 fields, so 0–20 covers every dense array.
export const MULTIPART_FIELD_LIMITS = { fieldArrayIndexLimit: 20 };
