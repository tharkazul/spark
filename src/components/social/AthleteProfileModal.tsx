import React from 'react';
import { Modal } from 'react-native';
import { Activity } from '../../types/activity';
import { AthleteProfileView } from './AthleteProfileView';

export interface AthleteProfileModalProps {
  visible: boolean;
  athleteId: number | string | null;
  onClose: () => void;
  onOpenActivityModal?: (id: string | number, activity?: Partial<Activity>) => void;
}

export const AthleteProfileModal: React.FC<AthleteProfileModalProps> = ({
  visible,
  athleteId,
  onClose,
  onOpenActivityModal,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <AthleteProfileView
        athleteId={athleteId}
        onClose={onClose}
        onOpenActivity={onOpenActivityModal}
        isPushScreen={false}
      />
    </Modal>
  );
};
