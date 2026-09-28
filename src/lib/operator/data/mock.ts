/**
 * DEMO operator + assignments — development only.
 * Assignments reference existing demo match IDs from the public mock data.
 */
import type { Assignment, Operator } from "../types";

export const demoOperator: Operator = { id: "op-demo-1", displayName: "Demo Operator" };

const ready = { atVenue: true, teamsPresent: true, officialsReady: true };
const notReady = { atVenue: false, teamsPresent: false, officialsReady: false };

export const demoAssignments: Assignment[] = [
  // Live now — mid second half.
  { matchId: "ifc-md5-art-eng", operatorId: "op-demo-1", role: "PRIMARY", prep: ready },
  // Later today — prep not yet done.
  { matchId: "ifc-md5-ssc-mgt", operatorId: "op-demo-1", role: "PRIMARY", prep: notReady },
  { matchId: "ifw-md4-mgt-sci", operatorId: "op-demo-1", role: "BACKUP", prep: notReady },
  // Upcoming.
  { matchId: "idc-sf2-mac-tma", operatorId: "op-demo-1", role: "PRIMARY", prep: notReady },
  { matchId: "ifc-md6-eng-edu", operatorId: "op-demo-1", role: "BACKUP", prep: notReady },
  // Completed / disrupted.
  { matchId: "idc-sf1-csc-acc", operatorId: "op-demo-1", role: "PRIMARY", prep: ready },
  { matchId: "ifc-md4-mgt-edu", operatorId: "op-demo-1", role: "PRIMARY", prep: notReady },
];
