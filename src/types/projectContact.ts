export type SignMethod = 'email' | 'sms';

export interface ProjectContact {
  id: string;
  projectId: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  preferredSignMethod: SignMethod;
  isPrimarySigner: boolean;
  ccReports: boolean;
  createdAt: string;
}

export interface ProjectDeliveryProfile {
  id: string;
  projectId: string;
  label: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postCode?: string;
  country?: string;
  deliveryNotes?: string;
  accessHours?: string;
  isDefault: boolean;
  createdAt: string;
}

export type InboundCondition = 'Good' | 'Damaged' | 'Needs Assessment';
export type InboundItemType = 'Part' | 'Warranty' | 'Return' | 'Other';

export interface ProjectInboundItem {
  id: string;
  projectId: string;
  description: string;
  quantity: number;
  unit?: string;
  condition: InboundCondition;
  referenceNumber?: string;
  receivedDate?: string;
  receivedBy?: string;
  notes?: string;
  itemType: InboundItemType;
  createdAt: string;
}
