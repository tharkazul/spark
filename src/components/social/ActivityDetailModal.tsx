import React from 'react';
import { Modal } from 'react-native';
import { Activity } from '../../types/activity';
import { ActivityDetailView } from './ActivityDetailView';

export interface ActivityDetailModalProps {
  visible: boolean;
  activityId: string | number | null;
  initialActivity?: Partial<Activity>;
  onClose: () => void;
  onOpenAthleteProfile?: (userId: number | string) => void;
}

export const ActivityDetailModal: React.FC<ActivityDetailModalProps> = ({
  visible,
  activityId,
  initialActivity,
  onClose,
  onOpenAthleteProfile,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ActivityDetailView
        activityId={activityId}
        initialActivity={initialActivity}
        onClose={onClose}
        onOpenAthleteProfile={onOpenAthleteProfile}
        isPushScreen={false}
      />
    </Modal>
  );
};
