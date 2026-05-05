# Security Spec

1. Data Invariants: 
   - A project cannot exist without a valid userId.
   - Project userId must match request.auth.uid.

2. The "Dirty Dozen" Payloads:
   - Bad Type (name is an array)
   - Extra Field (isAdmin)
   - Missing Field (data)
   - Bad ID format
   - Spoofed Owner ID
   - Missing Auth
   - Unverified Email
   - Giant String (Resource Poisoning)
   - Wrong Timestamp
   - Bad update payload
   - Updating read-only field
   - Deleting someone else's project

3. The Test Runner will be in firestore.rules.test.ts
