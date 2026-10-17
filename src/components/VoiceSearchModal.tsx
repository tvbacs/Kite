import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import * as IntentLauncher from 'expo-intent-launcher';

// An toàn tải expo-speech-recognition nếu có (chạy trong custom dev build / prebuild)
let SpeechModule: any = null;
try {
  const req = require('expo-speech-recognition');
  SpeechModule = req.ExpoSpeechRecognitionModule;
} catch (err) {
  SpeechModule = null;
}

interface VoiceSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  currentEngineName?: string;
}

const QUICK_VOICE_PROMPTS = [
  'Thời tiết hôm nay',
  'Tin tức mới nhất',
  'YouTube',
  'Google Dịch',
  'Phim hay 2026',
];

export const VoiceSearchModal: React.FC<VoiceSearchModalProps> = ({
  visible,
  onClose,
  onSearch,
  currentEngineName = 'Google',
}) => {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Hiệu ứng sóng âm Google 4 màu (Xanh dương, Đỏ, Vàng, Xanh lá)
  const dotAnim1 = useRef(new Animated.Value(0)).current;
  const dotAnim2 = useRef(new Animated.Value(0)).current;
  const dotAnim3 = useRef(new Animated.Value(0)).current;
  const dotAnim4 = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Thời gian bắt đầu giữ nút để phân biệt chạm nhẹ vs nhấn giữ
  const pressStartTimeRef = useRef<number>(0);
  const isPressingRef = useRef<boolean>(false);
  const transcriptRef = useRef<string>('');

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Khởi động các vòng lặp animation khi đang lắng nghe / nhấn giữ
  useEffect(() => {
    let animLoop: Animated.CompositeAnimation | null = null;
    let pulseLoop: Animated.CompositeAnimation | null = null;

    if (visible && isListening) {
      const createDotBounce = (anim: Animated.Value, delay: number) =>
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: -14,
            duration: 350,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 350,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]);

      animLoop = Animated.loop(
        Animated.parallel([
          createDotBounce(dotAnim1, 0),
          createDotBounce(dotAnim2, 120),
          createDotBounce(dotAnim3, 240),
          createDotBounce(dotAnim4, 360),
        ])
      );
      animLoop.start();

      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
    } else {
      dotAnim1.setValue(0);
      dotAnim2.setValue(0);
      dotAnim3.setValue(0);
      dotAnim4.setValue(0);
      pulseAnim.setValue(1);
    }

    return () => {
      if (animLoop) animLoop.stop();
      if (pulseLoop) pulseLoop.stop();
    };
  }, [visible, isListening]);

  // Reset khi modal đóng mở
  useEffect(() => {
    if (!visible) {
      stopNativeRecognition();
      setIsListening(false);
      setTranscript('');
      setErrorMessage(null);
      isPressingRef.current = false;
    }
  }, [visible]);

  const stopNativeRecognition = () => {
    if (SpeechModule) {
      try {
        SpeechModule.stop();
      } catch (err) {}
    }
  };

  /**
   * Gọi Google Speech Recognizer hệ thống qua Android Intent
   * Hoạt động 100% trên mọi thiết bị Android (kể cả chạy Expo Go)
   */
  const launchGoogleSpeechIntent = async () => {
    if (Platform.OS !== 'android') {
      setErrorMessage('Tính năng giọng nói Google yêu cầu thiết bị Android');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsListening(true);
      setErrorMessage(null);

      const result = await IntentLauncher.startActivityAsync(
        'android.speech.action.RECOGNIZE_SPEECH',
        {
          extra: {
            'android.speech.extra.LANGUAGE_MODEL': 'free_form',
            'android.speech.extra.LANGUAGE': 'vi-VN',
            'android.speech.extra.PROMPT': 'Nói nội dung bạn muốn tìm kiếm...',
          },
        }
      );

      setIsListening(false);

      if (result.resultCode === -1 && result.extra) {
        const extraData = result.extra as any;
        const results =
          extraData['android.speech.extra.RESULTS'] ||
          extraData['android.speech.extra.VOICE_SEARCH_RESULT_STRINGS'];

        let spokenText = '';
        if (Array.isArray(results) && results.length > 0) {
          spokenText = String(results[0]).trim();
        } else if (typeof results === 'string') {
          spokenText = results.trim();
        }

        if (spokenText) {
          setTranscript(spokenText);
          handleExecuteSearch(spokenText);
        } else {
          setErrorMessage('Chưa nhận được từ khóa giọng nói. Vui lòng thử lại.');
        }
      }
    } catch (e: any) {
      setIsListening(false);
      console.log('Google Speech Intent error:', e);
      setErrorMessage('Không thể mở nhận diện giọng nói: ' + (e?.message || 'Lỗi thiết bị'));
    }
  };

  /**
   * Khi người dùng nhấn giữ nút Micro ("Nhấn giữ để nói")
   */
  const handlePressIn = async () => {
    isPressingRef.current = true;
    pressStartTimeRef.current = Date.now();
    setTranscript('');
    setErrorMessage(null);
    setIsListening(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Nếu có SpeechModule native (trên custom build), khởi động microphone trực tiếp
    if (SpeechModule) {
      try {
        const perm = await SpeechModule.requestPermissionsAsync();
        if (!perm.granted) {
          setErrorMessage('Vui lòng cấp quyền Microphone để nhận diện giọng nói');
          setIsListening(false);
          return;
        }

        SpeechModule.start({
          lang: 'vi-VN',
          interimResults: true,
          maxAlternatives: 1,
          continuous: false,
        });

        // Lắng nghe kết quả
        SpeechModule.addListener(
          'result',
          (event: { results: { transcript: string }[]; isFinal: boolean }) => {
            const spoken = event.results?.[0]?.transcript || '';
            if (spoken) {
              setTranscript(spoken);
            }
          }
        );
      } catch (err) {
        console.log('SpeechModule start err:', err);
      }
    }
  };

  /**
   * Khi người dùng thả tay khỏi nút Micro ("Thả ra để tìm")
   */
  const handlePressOut = async () => {
    if (!isPressingRef.current) return;
    isPressingRef.current = false;
    const holdDuration = Date.now() - pressStartTimeRef.current;
    setIsListening(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopNativeRecognition();

    const currentSpoken = transcriptRef.current.trim();

    // 1. Nếu đã nhận diện được giọng nói trong lúc giữ -> Tìm kiếm ngay lập tức!
    if (currentSpoken.length > 0) {
      handleExecuteSearch(currentSpoken);
      return;
    }

    // 2. Nếu người dùng nhấn thả quá nhanh hoặc môi trường Expo Go không có SpeechModule trực tiếp:
    // Tự động mở Google Voice Search hệ thống (chuẩn xác 100% bằng tiếng Việt)
    if (Platform.OS === 'android') {
      launchGoogleSpeechIntent();
    } else {
      setErrorMessage('Chưa nghe rõ từ khóa. Hãy nhấn giữ lâu hơn và nói to rõ.');
    }
  };

  const handleExecuteSearch = (query: string) => {
    const q = query.trim();
    if (!q) return;
    stopNativeRecognition();
    onClose();
    onSearch(q);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalBackdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.sheetContainer}>
              {/* Nút đóng ở góc trên bên phải */}
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={20} color="#a1a1aa" />
              </TouchableOpacity>

              {/* Tiêu đề trạng thái: Nhấn giữ để nói, thả ra để tìm */}
              <Text style={styles.statusTitle}>
                {isListening ? 'Đang nghe... (Thả ra để tìm)' : 'Nhấn giữ để nói, thả ra để tìm'}
              </Text>
              <Text style={styles.statusSub}>
                {isListening
                  ? 'Hãy nói từ khóa bạn muốn tìm kiếm...'
                  : 'Nhấn giữ nút micro bên dưới hoặc chạm để mở Google Voice'}
              </Text>

              {/* Hiển thị văn bản nói theo thời gian thực */}
              <View style={styles.transcriptWrap}>
                {transcript ? (
                  <Text style={styles.transcriptText}>"{transcript}"</Text>
                ) : (
                  <Text style={styles.transcriptPlaceholder}>
                    Nội dung bạn nói sẽ xuất hiện tại đây...
                  </Text>
                )}
              </View>

              {/* Thông báo lỗi nếu có */}
              {errorMessage ? (
                <Text style={styles.errorText}>{errorMessage}</Text>
              ) : null}

              {/* Sóng âm 4 màu Google sinh động */}
              <View style={styles.soundWaveRow}>
                <Animated.View
                  style={[
                    styles.soundDot,
                    { backgroundColor: '#4285F4', transform: [{ translateY: dotAnim1 }] },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.soundDot,
                    { backgroundColor: '#EA4335', transform: [{ translateY: dotAnim2 }] },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.soundDot,
                    { backgroundColor: '#FBBC05', transform: [{ translateY: dotAnim3 }] },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.soundDot,
                    { backgroundColor: '#34A853', transform: [{ translateY: dotAnim4 }] },
                  ]}
                />
              </View>

              {/* Nút Micro to tròn ở trung tâm: NHẤN GIỮ ĐỂ NÓI - THẢ RA ĐỂ TÌM */}
              <View style={styles.micButtonContainer}>
                <Animated.View
                  style={[
                    styles.micPulseRing,
                    isListening && { transform: [{ scale: pulseAnim }], opacity: 0.35 },
                  ]}
                />
                <TouchableOpacity
                  style={[styles.micBigBtn, isListening ? styles.micBigBtnActive : null]}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  activeOpacity={0.85}
                  delayPressIn={0}
                >
                  <MaterialCommunityIcons
                    name={isListening ? 'microphone' : 'microphone-outline'}
                    size={38}
                    color="#ffffff"
                  />
                </TouchableOpacity>
              </View>

              {/* Nút mở nhanh Google Voice Search chuẩn xác 100% */}
              {Platform.OS === 'android' && (
                <TouchableOpacity
                  style={styles.googleVoiceDirectBtn}
                  onPress={launchGoogleSpeechIntent}
                  activeOpacity={0.75}
                >
                  <MaterialCommunityIcons
                    name="google"
                    size={16}
                    color="#4285F4"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.googleVoiceDirectText}>
                    Chạm để mở hộp thoại Google Voice
                  </Text>
                </TouchableOpacity>
              )}

              {/* Nếu đã có kết quả nhận diện, hiển thị nút Tìm kiếm ngay */}
              {transcript.trim().length > 0 ? (
                <TouchableOpacity
                  style={styles.searchNowBtn}
                  onPress={() => handleExecuteSearch(transcript)}
                  activeOpacity={0.8}
                >
                  <Feather name="search" size={17} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.searchNowBtnText}>Tìm "{transcript}" ngay</Text>
                </TouchableOpacity>
              ) : null}

              {/* Gợi ý nói mẫu nhanh */}
              <View style={styles.quickPromptsSection}>
                <Text style={styles.quickPromptsLabel}>Hoặc chọn nhanh từ khóa:</Text>
                <View style={styles.promptChipsRow}>
                  {QUICK_VOICE_PROMPTS.map((prompt, idx) => (
                    <TouchableOpacity
                      key={`prompt-${idx}`}
                      style={styles.promptChip}
                      onPress={() => handleExecuteSearch(prompt)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.promptChipText}>{prompt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Hộp nhập từ khóa dự phòng */}
              <View style={styles.simulationBanner}>
                <View style={styles.simInputRow}>
                  <TextInput
                    style={styles.simInput}
                    placeholder="Hoặc gõ nhanh từ khóa tìm kiếm..."
                    placeholderTextColor="#71717a"
                    value={transcript}
                    onChangeText={setTranscript}
                    onSubmitEditing={() => handleExecuteSearch(transcript)}
                    returnKeyType="search"
                  />
                  {transcript.trim().length > 0 && (
                    <TouchableOpacity
                      style={styles.simGoBtn}
                      onPress={() => handleExecuteSearch(transcript)}
                    >
                      <Feather name="arrow-right" size={16} color="#ffffff" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    width: '100%',
    backgroundColor: '#1e1f23',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  statusSub: {
    fontSize: 13,
    color: '#9aa0a6',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  transcriptWrap: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  transcriptText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#93c5fd',
    textAlign: 'center',
    lineHeight: 25,
  },
  transcriptPlaceholder: {
    fontSize: 13,
    color: '#71717a',
    textAlign: 'center',
    lineHeight: 18,
  },
  errorText: {
    fontSize: 13,
    color: '#f87171',
    marginBottom: 10,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  soundWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 28,
    marginBottom: 16,
  },
  soundDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  micButtonContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 96,
    height: 96,
    marginBottom: 12,
  },
  micPulseRing: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#3b82f6',
  },
  micBigBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  micBigBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#60a5fa',
  },
  googleVoiceDirectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(66, 133, 244, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(66, 133, 244, 0.3)',
    marginBottom: 14,
  },
  googleVoiceDirectText: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '600',
  },
  searchNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 22,
    marginBottom: 14,
  },
  searchNowBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  quickPromptsSection: {
    width: '100%',
    alignItems: 'center',
    marginTop: 2,
  },
  quickPromptsLabel: {
    fontSize: 12,
    color: '#71717a',
    marginBottom: 8,
    fontWeight: '500',
  },
  promptChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  promptChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  promptChipText: {
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '500',
  },
  simulationBanner: {
    width: '100%',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  simInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  simInput: {
    flex: 1,
    height: 38,
    color: '#ffffff',
    fontSize: 13,
  },
  simGoBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
