export interface QuickbaseSettingsForm {
  enabled: boolean;
  realmHostname: string;
  userToken: string;
  projectsTableId: string;
  installationsTableId: string;
  projectsFieldMap: string;
  installationsFieldMap: string;
  goodsMovementsTableId: string;
  goodsMovementsJobFid: string;
  goodsMovementsDirectionFid: string;
}

export interface QuickbaseSettingsPayload {
  enabled: boolean;
  realmHostname: string;
  userToken: string;
  projectsTableId: string;
  installationsTableId: string;
  projectsFieldMap: Record<string, number>;
  installationsFieldMap: Record<string, number>;
  goodsMovementsTableId: string;
  goodsMovementsJobFid: number;
  goodsMovementsDirectionFid: number;
}

export interface NotificationSettingsPayload {
  smtpHost: string;
  smtpPort: number;
  smtpUseSsl: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  frontendBaseUrl: string;
  smsProvider: string;
  smsApiKey: string;
  smsSender: string;
}
