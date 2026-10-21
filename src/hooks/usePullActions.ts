import { useState, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';
import { PullActionType, PULL_TRIGGER_THRESHOLD } from '../components/PullDownBar';
import { BrowserTab } from '../types/browser';

interface UsePullActionsProps {
  isEditing: boolean;
  activeTabIdRef: React.MutableRefObject<string>;
  tabs: BrowserTab[];
  webViewRefs: React.MutableRefObject<{ [tabId: string]: WebView | null }>;
  getActiveWebView: () => WebView | null;
  setIsLoading: (val: boolean) => void;
  setLoadProgress: (val: number) => void;
  triggerLoadingSafetyTimer: () => void;
  handleRetryOfflineTab: (tabId: string) => void;
  handleNewTab: (isIncognito: boolean) => void;
  handleCloseTab: (tabId: string) => void;
  isIncognito: boolean;
  showToast: (msg: string) => void;
}

export function usePullActions({
  isEditing,
  activeTabIdRef,
  tabs,
  webViewRefs,
  getActiveWebView,
  setIsLoading,
  setLoadProgress,
  triggerLoadingSafetyTimer,
  handleRetryOfflineTab,
  handleNewTab,
  handleCloseTab,
  isIncognito,
  showToast,
}: UsePullActionsProps) {
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [pullOffset, setPullOffset] = useState<number>(0);
  const [isPulling, setIsPulling] = useState<boolean>(false);
  const [activePullAction, setActivePullAction] = useState<PullActionType>('reload');
  const prevActionRef = useRef<PullActionType>('reload');

  const pullDistanceRef = useRef<number>(0);
  const activePullActionRef = useRef<PullActionType>('reload');
  const isPullingRef = useRef<boolean>(false);
  const isTriggerEngagedRef = useRef<boolean>(false);
  const lastReloadTimeRef = useRef<number>(0);
  const [homeRefreshTrigger, setHomeRefreshTrigger] = useState<number>(0);

  const triggerHaptic = (style: 'light' | 'medium' | 'selection') => {
    try {
      if (style === 'selection') {
        Haptics.selectionAsync();
      } else if (style === 'medium') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (style === 'light') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e) {}
  };

  const lastReportedDistRef = useRef(0);
  const lastReportedOffsetRef = useRef(0);

  const handlePullMove = (dy: number, dx: number) => {
    if (isEditing) return;

    // Không kích hoạt nếu kéo quá ít (< 18px) hoặc vuốt ngang nhiều hơn vuốt dọc
    if (!isPullingRef.current && (dy < 18 || (Math.abs(dx) > dy * 0.8 && dy < 40))) {
      return;
    }

    if (dy <= 0) {
      pullDistanceRef.current = 0;
      lastReportedDistRef.current = 0;
      lastReportedOffsetRef.current = 0;
      isTriggerEngagedRef.current = false;
      if (isPullingRef.current) {
        isPullingRef.current = false;
        setPullDistance(0);
        setPullOffset(0);
        setIsPulling(false);
      }
      return;
    }

    // Tính toán khoảng cách kéo mượt mà, có độ cản tự nhiên giống Safari/Chrome
    const distance = Math.max(0, (dy - 12) * 0.72);
    pullDistanceRef.current = distance;

    if (!isPullingRef.current) {
      isPullingRef.current = true;
      setIsPulling(true);
    }

    // Chỉ trigger re-render khi khoảng cách dịch chuyển thay đổi đủ lớn (>= 3px)
    if (
      Math.abs(distance - lastReportedDistRef.current) >= 3 ||
      Math.abs(dx - lastReportedOffsetRef.current) >= 4
    ) {
      lastReportedDistRef.current = distance;
      lastReportedOffsetRef.current = dx;
      setPullDistance(distance);
      setPullOffset(dx);
    }

    // Ngưỡng chuyển hành động ngang (trái: Thẻ mới, giữa: Tải lại, phải: Đóng thẻ)
    // Tăng lên 55px để tránh việc ngón tay hơi lệch góc vô tình chuyển sang đóng/mở thẻ
    let nextAction: PullActionType = 'reload';
    if (dx < -55) {
      nextAction = 'new_tab';
    } else if (dx > 55) {
      nextAction = 'close_tab';
    }

    activePullActionRef.current = nextAction;

    // Rung phản hồi haptic khi vừa vượt qua ngưỡng kích hoạt (70px) hoặc khi tụt xuống dưới ngưỡng
    if (distance >= PULL_TRIGGER_THRESHOLD) {
      if (!isTriggerEngagedRef.current) {
        isTriggerEngagedRef.current = true;
        triggerHaptic('medium');
      }
    } else {
      if (isTriggerEngagedRef.current) {
        isTriggerEngagedRef.current = false;
        triggerHaptic('selection');
      }
    }

    if (nextAction !== prevActionRef.current) {
      prevActionRef.current = nextAction;
      setActivePullAction(nextAction);
      triggerHaptic('selection');
    }
  };

  const executePullAction = (action: PullActionType) => {
    const curTabId = activeTabIdRef.current;
    const curTab = tabs.find((t) => t.id === curTabId);

    if (action === 'reload') {
      const now = Date.now();
      // Chống reload liên tục (debounce 1.5 giây)
      if (now - lastReloadTimeRef.current < 1500) {
        return;
      }
      lastReloadTimeRef.current = now;

      if (curTab?.isOffline) {
        handleRetryOfflineTab(curTabId);
        showToast('Đang thử kết nối lại...');
        return;
      }
      const activeWV = webViewRefs.current[curTabId] || null;
      if (curTab?.url && activeWV) {
        setIsLoading(true);
        setLoadProgress(0.15);
        triggerLoadingSafetyTimer();
        activeWV.reload();
        showToast('Đang tải lại trang...');
      } else {
        setHomeRefreshTrigger((prev) => prev + 1);
        showToast('Đã làm mới trang chủ');
      }
    } else if (action === 'new_tab') {
      handleNewTab(isIncognito);
      showToast('Đã mở thẻ mới');
    } else if (action === 'close_tab') {
      handleCloseTab(curTabId);
      showToast('Đã đóng thẻ');
    }
  };

  const handlePullEnd = () => {
    const curDist = pullDistanceRef.current;
    const curAction = activePullActionRef.current;
    const wasPulling = isPullingRef.current;

    pullDistanceRef.current = 0;
    isPullingRef.current = false;
    isTriggerEngagedRef.current = false;
    activePullActionRef.current = 'reload';
    prevActionRef.current = 'reload';

    setIsPulling(false);
    setPullDistance(0);
    setPullOffset(0);
    setActivePullAction('reload');

    // Chỉ thực hiện khi người dùng cố ý kéo vượt qua ngưỡng kích hoạt 70px (chuẩn Chrome)
    const isActionTriggered = curDist >= PULL_TRIGGER_THRESHOLD;
    if (wasPulling && isActionTriggered) {
      triggerHaptic('medium');
      executePullAction(curAction);
    }
  };

  const handlePullCancel = () => {
    pullDistanceRef.current = 0;
    isPullingRef.current = false;
    isTriggerEngagedRef.current = false;
    activePullActionRef.current = 'reload';
    prevActionRef.current = 'reload';

    setIsPulling(false);
    setPullDistance(0);
    setPullOffset(0);
    setActivePullAction('reload');
  };

  const headerTouchStartY = useRef(0);
  const headerTouchStartX = useRef(0);
  const headerIsPulling = useRef(false);

  const handleHeaderTouchStart = (e: any) => {
    headerTouchStartY.current = e.nativeEvent.pageY;
    headerTouchStartX.current = e.nativeEvent.pageX;
    headerIsPulling.current = false;
  };

  const handleHeaderTouchMove = (e: any) => {
    const dy = e.nativeEvent.pageY - headerTouchStartY.current;
    const dx = e.nativeEvent.pageX - headerTouchStartX.current;
    if (dy > 18) {
      headerIsPulling.current = true;
      handlePullMove(dy, dx);
    }
  };

  const handleHeaderTouchEnd = () => {
    if (headerIsPulling.current) {
      headerIsPulling.current = false;
      handlePullEnd();
    } else {
      const activeWV = getActiveWebView();
      if (activeWV) {
        activeWV.injectJavaScript('window.scrollTo({ top: 0, behavior: "smooth" }); true;');
      }
    }
  };

  return {
    pullDistance,
    pullOffset,
    isPulling,
    activePullAction,
    homeRefreshTrigger,
    handlePullMove,
    handlePullEnd,
    handlePullCancel,
    executePullAction,
    handleHeaderTouchStart,
    handleHeaderTouchMove,
    handleHeaderTouchEnd,
  };
}
