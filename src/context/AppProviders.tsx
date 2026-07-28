import React, { ReactNode } from 'react';
import { TabBarProvider } from './TabBarContext';
import { UserStore } from './UserStore';
import { ActivityStore } from './ActivityStore';
import { PlanStore } from './PlanStore';
import { PhysiqueStore } from './PhysiqueStore';
import { GamificationStore } from './GamificationStore';
import { HealthStore } from './HealthStore';
import { CoachChatStore } from './CoachChatStore';

export const AppProviders: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <UserStore>
      <ActivityStore>
        <PlanStore>
          <PhysiqueStore>
            <GamificationStore>
              <HealthStore>
                <CoachChatStore>
                  <TabBarProvider>{children}</TabBarProvider>
                </CoachChatStore>
              </HealthStore>
            </GamificationStore>
          </PhysiqueStore>
        </PlanStore>
      </ActivityStore>
    </UserStore>
  );
};
