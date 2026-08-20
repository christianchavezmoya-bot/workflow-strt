import { useCallback, useEffect, useRef, useState } from "react";
import { shouldSkipBlockingFetch } from "../../services/connectivityMonitor";
import {
  assetWorkflowRunService,
  type OpenIssueRecord,
  type PendingSignatureRecord,
} from "../../services/assetWorkflowRunService";
import { IssueRepository } from "../../repositories/IssueRepository";
import { get as dcGet, put as dcPut, DASHBOARD_CACHE_KEYS } from "../../services/dashboardCache";

const DASHBOARD_ATTENTION_SESSION_PREFIX = "dashboard:web:attention:";

export type UseDashboardAttentionParams = {
  isManager: boolean;
  isNativePlatform: boolean;
  userId: string;
  onNativeCacheHydrated?: () => void;
};

export function useDashboardAttention({
  isManager,
  isNativePlatform,
  userId,
  onNativeCacheHydrated,
}: UseDashboardAttentionParams) {
  const [openIssues, setOpenIssues] = useState<OpenIssueRecord[]>([]);
  const [pendingSigs, setPendingSigs] = useState<PendingSignatureRecord[]>([]);
  const [attentionLoading, setAttentionLoading] = useState(false);

  const attentionRequestSeqRef = useRef(0);
  const attentionInFlightRef = useRef<Promise<void> | null>(null);
  const attentionQueuedRef = useRef(false);
  const attentionLoadedOnceRef = useRef(false);

  const loadAttention = useCallback((options?: { silent?: boolean }): Promise<void> => {
    if (attentionInFlightRef.current) {
      attentionQueuedRef.current = true;
      return attentionInFlightRef.current;
    }

    const requestSeq = ++attentionRequestSeqRef.current;
    const promise = (async () => {
      const showLoading = !(options?.silent && attentionLoadedOnceRef.current);
      if (showLoading) setAttentionLoading(true);
      const attentionUserId = isManager ? undefined : userId;
      const applyAttention = (iss: OpenIssueRecord[], sigs: PendingSignatureRecord[]) => {
        if (requestSeq !== attentionRequestSeqRef.current) return;
        setOpenIssues(iss);
        setPendingSigs(sigs);
      };
      const finishAttention = () => {
        if (requestSeq !== attentionRequestSeqRef.current) return;
        attentionLoadedOnceRef.current = true;
        if (showLoading) setAttentionLoading(false);
      };

      if (isNativePlatform) {
        let cachedIssues: OpenIssueRecord[] = [];
        let cachedSigs: PendingSignatureRecord[] = [];
        try {
          [cachedIssues, cachedSigs] = await Promise.all([
            assetWorkflowRunService.listOpenIssues(attentionUserId),
            assetWorkflowRunService.listPendingSignaturesLocal(attentionUserId),
          ]);
          applyAttention(cachedIssues, cachedSigs);
        } catch {
          // Keep the current attention widgets if local cache probing fails.
        }
        if (shouldSkipBlockingFetch()) {
          finishAttention();
          return;
        }
        // Open issues: IssueRepository.getAll already kicked off a background GET on the
        // first listOpenIssues call — skip a redundant blocking fetch here.
        try {
          const sigs = await assetWorkflowRunService.listPendingSignatures(attentionUserId);
          applyAttention(cachedIssues, sigs);
        } catch {
          // Keep local attention widgets on timeout or server errors.
        } finally {
          finishAttention();
        }
        return;
      }

      try {
        const [iss, sigs] = await Promise.all([
          assetWorkflowRunService.listOpenIssues(attentionUserId),
          assetWorkflowRunService.listPendingSignatures(attentionUserId),
        ]);
        applyAttention(iss, sigs);
        if (!isNativePlatform && userId) {
          try {
            sessionStorage.setItem(
              `${DASHBOARD_ATTENTION_SESSION_PREFIX}${userId}`,
              JSON.stringify({ issues: iss, sigs }),
            );
          } catch {
            // Ignore storage quota errors.
          }
        }
      } catch {
        // Keep session-cached attention widgets on timeout or server errors.
      } finally {
        finishAttention();
      }
    })();

    attentionInFlightRef.current = promise.finally(() => {
      attentionInFlightRef.current = null;
      if (attentionQueuedRef.current) {
        attentionQueuedRef.current = false;
        void loadAttention({ silent: true });
      }
    });

    return attentionInFlightRef.current;
  }, [isManager, isNativePlatform, userId]);

  const refreshAttentionFromIssueCache = useCallback(async () => {
    const attentionUserId = isManager ? undefined : userId;
    try {
      const [issues, sigs] = await Promise.all([
        isNativePlatform
          ? IssueRepository.getLocalSnapshot()
          : assetWorkflowRunService.listOpenIssues(attentionUserId),
        isNativePlatform
          ? assetWorkflowRunService.listPendingSignaturesLocal(attentionUserId)
          : assetWorkflowRunService.listPendingSignatures(attentionUserId),
      ]);
      setOpenIssues(issues);
      setPendingSigs(sigs);
    } catch {
      // Keep current widgets if the local snapshot read fails.
    }
  }, [isManager, isNativePlatform, userId]);

  useEffect(() => {
    if (!isNativePlatform) return;
    const cachedIssues = dcGet<OpenIssueRecord[]>(DASHBOARD_CACHE_KEYS.openIssues);
    const cachedSigs = dcGet<PendingSignatureRecord[]>(DASHBOARD_CACHE_KEYS.pendingSigs);
    if (cachedIssues) setOpenIssues(cachedIssues);
    if (cachedSigs) setPendingSigs(cachedSigs);
    if (cachedIssues || cachedSigs) onNativeCacheHydrated?.();
  }, [isNativePlatform, onNativeCacheHydrated]);

  useEffect(() => {
    if (isNativePlatform || !userId) return;
    try {
      const raw = sessionStorage.getItem(`${DASHBOARD_ATTENTION_SESSION_PREFIX}${userId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { issues?: OpenIssueRecord[]; sigs?: PendingSignatureRecord[] };
      if (parsed.issues) setOpenIssues(parsed.issues);
      if (parsed.sigs) setPendingSigs(parsed.sigs);
    } catch {
      // Ignore corrupt session cache.
    }
  }, [isNativePlatform, userId]);

  useEffect(() => {
    if (!isNativePlatform) return;
    dcPut(DASHBOARD_CACHE_KEYS.openIssues, openIssues);
    dcPut(DASHBOARD_CACHE_KEYS.pendingSigs, pendingSigs);
  }, [isNativePlatform, openIssues, pendingSigs]);

  return {
    openIssues,
    setOpenIssues,
    pendingSigs,
    setPendingSigs,
    attentionLoading,
    loadAttention,
    refreshAttentionFromIssueCache,
  };
}
