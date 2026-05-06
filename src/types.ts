/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum TransactionType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT'
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  vendor: string;
}

export interface VendorSummary {
  vendor: string;
  debits: Transaction[];
  credits: Transaction[];
  totalDebit: number;
  totalCredit: number;
}

export interface ExtractionResult {
  transactions: Transaction[];
  vendorSummaries: VendorSummary[];
}

export interface SavedReport {
  id: string;
  label: string;
  date: string;
  result: ExtractionResult;
}
