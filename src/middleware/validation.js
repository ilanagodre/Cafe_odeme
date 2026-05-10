const joi = require("joi");

// ─── Validation Schemas ────────────────────────────────

const schemas = {
  // Auth endpoints
  login: joi.object({
    pin: joi.string().length(4).pattern(/^\d+$/).required(),
  }),

  // Session/Order endpoints
  sessionJoin: joi.object({
    qrCode: joi.string().max(255).required(),
    participantName: joi.string().min(1).max(100).required(),
  }),

  placeOrder: joi.object({
    sessionToken: joi.string().uuid().required(),
    itemName: joi.string().min(1).max(200).required(),
    quantity: joi.number().integer().min(1).max(999).required(),
    price: joi.number().min(0).max(999999).required(),
    orderedBy: joi.string().uuid().required(),
  }),

  // Payment endpoints
  payment: joi.object({
    sessionToken: joi.string().uuid().required(),
    participantId: joi.string().uuid().required(),
    amount: joi.number().min(0.01).max(999999).required(),
  }),

  paymentFull: joi.object({
    sessionToken: joi.string().uuid().required(),
    paidBy: joi.string().uuid().required(),
  }),

  paymentFor: joi.object({
    sessionToken: joi.string().uuid().required(),
    paidBy: joi.string().uuid().required(),
    targetParticipantId: joi.string().uuid().required(),
    amount: joi.number().min(0.01).max(999999).required(),
  }),

  paymentItem: joi.object({
    sessionToken: joi.string().uuid().required(),
    paidBy: joi.string().uuid().required(),
    orderIds: joi.array().items(joi.string().uuid()).min(1).required(),
  }),

  cashPayment: joi.object({
    paymentType: joi
      .string()
      .valid("cash", "transfer", "credit_card", "other")
      .required(),
  }),

  // Admin endpoints
  staffAdd: joi.object({
    name: joi.string().min(1).max(100).required(),
    role: joi.string().valid("waiter", "head_waiter", "owner").required(),
    pin: joi.string().length(4).pattern(/^\d+$/).required(),
  }),

  staffResetPin: joi.object({
    newPin: joi.string().length(4).pattern(/^\d+$/).required(),
  }),

  staffUpdateRole: joi.object({
    role: joi.string().valid("waiter", "head_waiter", "owner").required(),
  }),

  staffToggleActive: joi.object({
    is_active: joi.boolean().required(),
  }),

  splitBill: joi.object({
    sessionToken: joi.string().uuid().required(),
    splitType: joi.string().valid("equal", "item").required(),
    participantIds: joi.array().items(joi.string().uuid()).min(2).required(),
  }),

  adminAddParticipant: joi.object({
    participantName: joi.string().min(1).max(100).required(),
  }),
};

// ─── Validation Middleware ────────────────────────────

function validate(schemaKey) {
  return (req, res, next) => {
    const schema = schemas[schemaKey];
    if (!schema) {
      require("../config/logger").error(
        `[ERR] Validation schema not found: ${schemaKey}`,
      );
      return res.status(500).json({ error: "Internal validation error" });
    }

    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all errors
      stripUnknown: true, // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(400).json({
        error: "Validation error",
        details: errors,
      });
    }

    // Replace req.body with validated value
    req.body = value;
    next();
  };
}

module.exports = { validate, schemas };
