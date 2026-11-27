/** Official club crests supplied by the teams, keyed by team id (files in /public/crests). */
export const CRESTS: Record<string, string> = {
  "72c7cdcb-91d7-4532-bcb1-cc2fd4bc96df": "/crests/his-200l.png", // History & International Studies 200L (Dynasty FC)
  "d9bb0139-97ca-460f-b170-92930e3cf80c": "/crests/pessans-eksu.png", // PESSANS EKSU
  "86bbbac3-c2f8-4599-b476-beed5f6e6d10": "/crests/napcss-fuoye.png", // NAPCSS FUOYE
  "d6c9d32f-5073-4def-9f66-42f5549a57e9": "/crests/fsf-eksu.png", // FSF EKSU (NaFFS)
  "540f74d9-538c-43ef-b483-4f6ff3f10c46": "/crests/dm-greeners.png", // DM Greeners
  "e95b26a1-4a64-4f34-941b-e3bb94a78efc": "/crests/downfall-fc.png", // Downfall FC
  "c58f765e-52a0-4d03-93fa-8e48cf94cdcf": "/crests/khe.png", // KHE
  "e439404f-fc81-4afb-8cd7-db16d8c76fa6": "/crests/ptsa-fc.png", // PTSA FC
  "75d6982a-1e7f-458d-bf31-9aa5769e5934": "/crests/gsf-eksu.png", // GSF EKSU
  "5ac39bb1-3275-46d8-80e1-5eeded538dc9": "/crests/civil-500l.png", // Civil 500L
  "89738187-3ea6-483c-a3de-ed0555190dc3": "/crests/finance-elite-fc.png", // Finance Elite FC
  "ab797ca0-f075-4455-8066-df309cb73dd3": "/crests/juris-convoy.png", // JURIS CONVOY
  "cd64556b-9592-481f-950b-1389daae5b38": "/crests/mechanical-500-level.png", // Mechanical 500 Level
  "aff30676-4a89-40e0-bc8a-21c9a5cb64f5": "/crests/internationalist-fc.png", // Internationalist FC
  "e882ef37-b018-413e-933e-c16ef3393187": "/crests/neuronerds-fc.png", // Neuronerds FC
  "38a0bc6b-50b4-43ea-a11c-17c01492f214": "/crests/physio-pheonix-fc.png", // Physio Pheonix FC
  "76a78e23-9a71-4aec-a2fd-9f044b27441f": "/crests/royal-pheonix-fc.png", // Royal Pheonix FC
  "5183391e-766b-4769-83bb-77d005a092db": "/crests/diplomat-fc.png", // DIPLOMAT FC
  "7a199427-0268-4b7e-a5d9-d4fc6af0309d": "/crests/unquestionable-fc.png", // Unquestionable FC
};

export const crestFor = (teamId: string | undefined): string | undefined => (teamId ? CRESTS[teamId] : undefined);
