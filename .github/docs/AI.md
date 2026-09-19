# Invento — AI Architecture

## Purpose

AI exists to reduce manual data entry and understand messy real-world retail
input.

AI is not the source of truth for business rules.

## Core AI Flow

```text
Image / Voice
     ↓
Preprocessing
     ↓
AI Interpretation
     ↓
Structured Extraction
     ↓
Product Matching
     ↓
Confidence
     ↓
User Review
     ↓
Confirmation
     ↓
Business Transaction
     ↓
Inventory Update
```

## Bill Scanner

The system should eventually support handwritten bills.

Initial approach:

- Existing vision models
- OCR
- Document understanding
- Structured LLM extraction

Do not train a custom handwriting model initially.

## Structured Output

AI should return structured information such as:

```json
{
  "items": [
    {
      "rawName": "rce",
      "quantity": 20,
      "unit": "KG",
      "unitPrice": 45
    }
  ]
}
```

## Product Matching

Matching order:

```text
Exact
 ↓
Alias
 ↓
Fuzzy
 ↓
Semantic
 ↓
AI suggestion
 ↓
User selection
```

## Product Aliases

Users may use local names, abbreviations, spelling mistakes, or language
variants.

Examples:

```text
rice
rce
rc
chawal
```

can map to one product.

User corrections should be stored as useful matching information.

## Confidence

Initial behavior:

```text
>95%
→ Highly confident, editable

70–95%
→ User verification

<70%
→ User selection required
```

These are starting assumptions and must be validated using real bills.

## Human Confirmation

AI must produce a proposal, not a final business transaction.

Required flow:

```text
AI Result
    ↓
Review/Edit
    ↓
User Confirmation
    ↓
Business Transaction
```

## Languages

Initial target:

- English
- Hindi
- Hinglish

Other Indian languages should be added based on user demand.

## Voice

Future flow:

```text
Voice
 ↓
Speech-to-text
 ↓
Structured extraction
 ↓
Product matching
 ↓
Confirmation
 ↓
Transaction
```

Example:

> Add 20 kilo rice at 45 rupees.

## AI Safety Rules

AI must not:

- Directly modify inventory
- Bypass authorization
- Decide business ownership
- Bypass validation
- Create unreviewed financial transactions

AI should assist the user, not silently act as the accounting source of truth.

## Real-World Validation

Before investing in custom models, test the system using real handwritten
bills from multiple people.

Measure:

- Correct product identification
- Correct quantity
- Correct unit
- Correct price
- Correct transaction type
- User correction rate
- End-to-end transaction correctness

Business transaction correctness matters more than raw OCR accuracy.
