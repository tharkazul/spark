import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { G, Path, Circle, Rect, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

export interface ActiveNiggle {
  id?: number | string;
  body_part: string;
  severity: number; // 1 - 5
  notes?: string;
}

interface AnatomicalBodyMapProps {
  activeNiggles?: ActiveNiggle[];
  onSelectBodyPart: (bodyPartId: string, displayName: string) => void;
}

export const BODY_PARTS_LOOKUP: Record<string, string> = {
  head_neck: 'Head & Neck',
  left_shoulder: 'Left Shoulder',
  right_shoulder: 'Right Shoulder',
  chest: 'Chest & Pectorals',
  upper_back: 'Upper Back & Shoulders',
  lower_back: 'Lower Back & Spine',
  core: 'Core & Abdominals',
  left_arm: 'Left Arm & Elbow',
  right_arm: 'Right Arm & Elbow',
  left_glute: 'Left Glute',
  right_glute: 'Right Glute',
  left_quad: 'Left Quadricep',
  right_quad: 'Right Quadricep',
  left_hamstring: 'Left Hamstring',
  right_hamstring: 'Right Hamstring',
  left_knee: 'Left Knee',
  right_knee: 'Right Knee',
  left_calf: 'Left Calf & Shin',
  right_calf: 'Right Calf & Shin',
  left_ankle_foot: 'Left Ankle & Foot',
  right_ankle_foot: 'Right Ankle & Foot',
};

export const AnatomicalBodyMap: React.FC<AnatomicalBodyMapProps> = ({
  activeNiggles = [],
  onSelectBodyPart,
}) => {
  const [view, setView] = useState<'front' | 'back'>('front');

  const getNiggleSeverity = (partId: string): number => {
    const found = activeNiggles.find((n) => n.body_part.toLowerCase() === partId.toLowerCase());
    return found ? Number(found.severity) : 0;
  };

  const getPartColor = (partId: string): { fill: string; stroke: string } => {
    const severity = getNiggleSeverity(partId);
    if (severity >= 4) return { fill: '#E3494F', stroke: '#FF6B70' };
    if (severity >= 2) return { fill: '#F98845', stroke: '#FFA56E' };
    if (severity === 1) return { fill: '#F9CF45', stroke: '#FFE382' };
    return { fill: '#2A343D', stroke: '#404E5A' };
  };

  const handlePress = (partId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const name = BODY_PARTS_LOOKUP[partId] || partId.replace('_', ' ');
    onSelectBodyPart(partId, name);
  };

  const renderPartGroup = (
    partId: string,
    children: React.ReactNode,
    label?: string
  ) => {
    const { fill, stroke } = getPartColor(partId);
    const hasNiggle = getNiggleSeverity(partId) > 0;

    return (
      <G
        onPress={() => handlePress(partId)}
        opacity={hasNiggle ? 0.95 : 0.85}
      >
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
              fill,
              stroke,
              strokeWidth: hasNiggle ? 2 : 1,
            });
          }
          return child;
        })}
      </G>
    );
  };

  return (
    <View className="items-center py-2">
      {/* Front / Back Toggle Buttons */}
      <View className="flex-row bg-theme-bg p-1 rounded-xl mb-4">
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setView('front');
          }}
          className={`px-5 py-2 rounded-lg ${
            view === 'front' ? 'bg-theme-accent' : 'bg-transparent'
          }`}
        >
          <Text
            className={`text-xs font-bold ${
              view === 'front' ? 'text-white' : 'text-theme-muted'
            }`}
          >
            Front View
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setView('back');
          }}
          className={`px-5 py-2 rounded-lg ${
            view === 'back' ? 'bg-theme-accent' : 'bg-transparent'
          }`}
        >
          <Text
            className={`text-xs font-bold ${
              view === 'back' ? 'text-white' : 'text-theme-muted'
            }`}
          >
            Back View
          </Text>
        </TouchableOpacity>
      </View>

      {/* SVG Anatomical Mannequin Body Map */}
      <View className="bg-theme-bg/60 p-4 rounded-2xl shadow-sm relative items-center justify-center">
        <Svg width={220} height={360} viewBox="0 0 220 360">
          {/* Background grid line accents */}
          <Circle cx="110" cy="180" r="140" stroke="#5A6973" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.15" />
          <Circle cx="110" cy="180" r="90" stroke="#5A6973" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.1" />

          {view === 'front' ? (
            /* FRONT VIEW */
            <G id="front-view">
              {/* Head & Neck */}
              {renderPartGroup('head_neck', (
                <G>
                  <Circle cx="110" cy="36" r="22" />
                  <Rect x="102" y="58" width="16" height="14" rx="4" />
                </G>
              ))}

              {/* Chest */}
              {renderPartGroup('chest', (
                <Path d="M82,75 L138,75 C142,75 144,82 142,98 L134,115 L86,115 L78,98 C76,82 78,75 82,75 Z" />
              ))}

              {/* Core */}
              {renderPartGroup('core', (
                <Path d="M86,118 L134,118 L130,150 L90,150 Z" />
              ))}

              {/* Shoulders */}
              {renderPartGroup('left_shoulder', (
                <Circle cx="68" cy="80" r="14" />
              ))}
              {renderPartGroup('right_shoulder', (
                <Circle cx="152" cy="80" r="14" />
              ))}

              {/* Arms */}
              {renderPartGroup('left_arm', (
                <G>
                  <Rect x="54" y="96" width="14" height="42" rx="7" />
                  <Circle cx="61" cy="144" r="7" />
                  <Rect x="55" y="153" width="12" height="38" rx="6" />
                </G>
              ))}
              {renderPartGroup('right_arm', (
                <G>
                  <Rect x="152" y="96" width="14" height="42" rx="7" />
                  <Circle cx="159" cy="144" r="7" />
                  <Rect x="153" y="153" width="12" height="38" rx="6" />
                </G>
              ))}

              {/* Hips */}
              {renderPartGroup('left_quad', (
                <Path d="M82,154 L108,154 L106,220 L84,220 Z" />
              ))}
              {renderPartGroup('right_quad', (
                <Path d="M112,154 L138,154 L136,220 L114,220 Z" />
              ))}

              {/* Knees */}
              {renderPartGroup('left_knee', (
                <Circle cx="95" cy="232" r="10" />
              ))}
              {renderPartGroup('right_knee', (
                <Circle cx="125" cy="232" r="10" />
              ))}

              {/* Calves & Shins */}
              {renderPartGroup('left_calf', (
                <Rect x="88" y="246" width="14" height="58" rx="7" />
              ))}
              {renderPartGroup('right_calf', (
                <Rect x="118" y="246" width="14" height="58" rx="7" />
              ))}

              {/* Feet */}
              {renderPartGroup('left_ankle_foot', (
                <Path d="M82,310 L100,310 L102,328 C102,333 80,333 80,328 Z" />
              ))}
              {renderPartGroup('right_ankle_foot', (
                <Path d="M120,310 L138,310 L140,328 C140,333 118,333 118,328 Z" />
              ))}
            </G>
          ) : (
            /* BACK VIEW */
            <G id="back-view">
              {/* Head & Neck */}
              {renderPartGroup('head_neck', (
                <G>
                  <Circle cx="110" cy="36" r="22" />
                  <Rect x="102" y="58" width="16" height="14" rx="4" />
                </G>
              ))}

              {/* Upper Back */}
              {renderPartGroup('upper_back', (
                <Path d="M78,75 L142,75 L138,115 L82,115 Z" />
              ))}

              {/* Lower Back */}
              {renderPartGroup('lower_back', (
                <Path d="M82,118 L138,118 L134,150 L86,150 Z" />
              ))}

              {/* Shoulders */}
              {renderPartGroup('left_shoulder', (
                <Circle cx="68" cy="80" r="14" />
              ))}
              {renderPartGroup('right_shoulder', (
                <Circle cx="152" cy="80" r="14" />
              ))}

              {/* Arms Back */}
              {renderPartGroup('left_arm', (
                <G>
                  <Rect x="54" y="96" width="14" height="42" rx="7" />
                  <Circle cx="61" cy="144" r="7" />
                  <Rect x="55" y="153" width="12" height="38" rx="6" />
                </G>
              ))}
              {renderPartGroup('right_arm', (
                <G>
                  <Rect x="152" y="96" width="14" height="42" rx="7" />
                  <Circle cx="159" cy="144" r="7" />
                  <Rect x="153" y="153" width="12" height="38" rx="6" />
                </G>
              ))}

              {/* Glutes */}
              {renderPartGroup('left_glute', (
                <Path d="M82,154 L109,154 L108,190 L84,188 Z" />
              ))}
              {renderPartGroup('right_glute', (
                <Path d="M111,154 L138,154 L136,188 L112,190 Z" />
              ))}

              {/* Hamstrings */}
              {renderPartGroup('left_hamstring', (
                <Path d="M84,192 L108,194 L105,224 L86,224 Z" />
              ))}
              {renderPartGroup('right_hamstring', (
                <Path d="M112,194 L136,192 L134,224 L115,224 Z" />
              ))}

              {/* Knees Back */}
              {renderPartGroup('left_knee', (
                <Circle cx="95" cy="232" r="10" />
              ))}
              {renderPartGroup('right_knee', (
                <Circle cx="125" cy="232" r="10" />
              ))}

              {/* Calves & Achilles Back */}
              {renderPartGroup('left_calf', (
                <Rect x="88" y="246" width="14" height="58" rx="7" />
              ))}
              {renderPartGroup('right_calf', (
                <Rect x="118" y="246" width="14" height="58" rx="7" />
              ))}

              {/* Heels & Feet Back */}
              {renderPartGroup('left_ankle_foot', (
                <Path d="M82,310 L100,310 L102,328 C102,333 80,333 80,328 Z" />
              ))}
              {renderPartGroup('right_ankle_foot', (
                <Path d="M120,310 L138,310 L140,328 C140,333 118,333 118,328 Z" />
              ))}
            </G>
          )}
        </Svg>

        <Text className="text-xs text-theme-muted mt-2 font-medium">
          Tap any body region to log an issue or view severity
        </Text>
      </View>
    </View>
  );
};
