import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Animated } from 'react-native';

export const progressBus = {
  set: (_val: number) => {},
  reset: () => {},
};

export interface WebProgressBarRef {
  setProgress: (val: number) => void;
  reset: () => void;
}

interface WebProgressBarProps {
  isLoading?: boolean;
  isIncognito?: boolean;
}

export const WebProgressBar = forwardRef<WebProgressBarRef, WebProgressBarProps>(
  ({ isLoading, isIncognito }, ref) => {
    const progressAnim = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    const handleSetProgress = (val: number) => {
      const target = Math.max(0, Math.min(1, val));
      if (target > 0 && target < 1) {
        opacityAnim.setValue(1);
      }
      Animated.timing(progressAnim, {
        toValue: target,
        duration: 120,
        useNativeDriver: false,
      }).start();

      if (target >= 1) {
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }).start(() => {
          progressAnim.setValue(0);
        });
      }
    };

    const handleReset = () => {
      progressAnim.setValue(0);
      opacityAnim.setValue(0);
    };

    useEffect(() => {
      progressBus.set = handleSetProgress;
      progressBus.reset = handleReset;
      return () => {
        progressBus.set = (_: number) => {};
        progressBus.reset = () => {};
      };
    }, []);

    useImperativeHandle(ref, () => ({
      setProgress: handleSetProgress,
      reset: handleReset,
    }));

    useEffect(() => {
      if (isLoading) {
        opacityAnim.setValue(1);
      } else {
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }).start(() => {
          progressAnim.setValue(0);
        });
      }
    }, [isLoading]);

    const widthPercent = progressAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    });

    return (
      <Animated.View
        style={[
          styles.loadingBarTrack,
          {
            opacity: opacityAnim,
          },
        ]}
        pointerEvents="none"
      >
        <Animated.View
          style={[
            styles.loadingBarProgress,
            {
              width: widthPercent,
              backgroundColor: isIncognito ? '#60a5fa' : '#007aff',
            },
          ]}
        />
      </Animated.View>
    );
  }
);

const styles = StyleSheet.create({
  loadingBarTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'transparent',
    zIndex: 9999,
  },
  loadingBarProgress: {
    height: '100%',
    borderRadius: 1.5,
  },
});
