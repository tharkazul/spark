import React, { ReactNode } from 'react';
import { LanguageProvider } from './LanguageContext';
import { TabBarProvider } from './TabBarContext';
import { UserStore } from './UserStore';
import { ActivityStore } from './ActivityStore';
import { PlanStore } from './PlanStore';
import { PhysiqueStore } from './PhysiqueStore';
import { GamificationStore } from './GamificationStore';
import { HealthStore } from './HealthStore';
import { CoachChatStore } from './CoachChatStore';
import { SubscriptionStore } from './SubscriptionStore';
import { SeasonStore } from './SeasonStore';

export const AppProviders: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <LanguageProvider>
      <UserStore>
        <SubscriptionStore>
          <ActivityStore>
            <PlanStore>
              <PhysiqueStore>
                <GamificationStore>
                  <HealthStore>
                    <CoachChatStore>
                      <SeasonStore>
                        <TabBarProvider>{children}</TabBarProvider>
                      </SeasonStore>
                    </CoachChatStore>
                  </HealthStore>
                </GamificationStore>
              </PhysiqueStore>
            </PlanStore>
          </ActivityStore>
        </SubscriptionStore>
      </UserStore>
    </LanguageProvider>
  );
};
