/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, Platform } from 'react-native';
import { colors, shadows } from '../src/theme';

/**
 * Gold Standard: ActivityCard
 * This file is the definitive reference for the agent.
 */
export interface ActivityCardProps {
  readonly id: string;
  readonly username: string;
  readonly action: 'MERGED' | 'COMMIT';
  readonly timestamp: string;
  readonly avatarUrl: string;
  readonly repoName: string;
  readonly onPress?: () => void;
}

export const ActivityCard: React.FC<ActivityCardProps> = ({
  username,
  action,
  timestamp,
  avatarUrl,
  repoName,
  onPress,
}) => {
  const isMerged = action === 'MERGED';

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${username} ${action.toLowerCase()} in ${repoName}`}
    >
      <View style={styles.leftContent}>
        <Image
          source={{ uri: avatarUrl }}
          style={styles.avatar}
          accessibilityLabel={`Avatar for ${username}`}
        />

        <View style={styles.textContent}>
          <Text style={styles.username} numberOfLines={1}>
            {username}
          </Text>

          <View
            style={[
              styles.badge,
              isMerged ? styles.badgeMerged : styles.badgeCommit,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                isMerged ? styles.badgeTextMerged : styles.badgeTextCommit,
              ]}
            >
              {action}
            </Text>
          </View>

          <Text style={styles.separator}>in</Text>

          <Text style={styles.repoName} numberOfLines={1}>
            {repoName}
          </Text>
        </View>
      </View>

      <Text style={styles.timestamp}>{timestamp}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    borderRadius: 8,
    padding: 16,
    minHeight: 56,
    ...shadows.card,
  },
  pressed: {
    opacity: 0.7,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
    overflow: 'hidden',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  textContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 8,
    rowGap: 4,
    flex: 1,
  },
  username: {
    fontWeight: '600',
    fontSize: 14,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeMerged: {
    backgroundColor: colors.badgeMergedBg,
  },
  badgeCommit: {
    backgroundColor: colors.badgeCommitBg,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextMerged: {
    color: colors.badgeMergedText,
  },
  badgeTextCommit: {
    color: colors.badgeCommitText,
  },
  separator: {
    fontSize: 14,
    opacity: 0.6,
  },
  repoName: {
    fontSize: 14,
  },
  timestamp: {
    fontSize: 14,
    fontWeight: '400',
    opacity: 0.5,
    flexShrink: 0,
  },
});

export default ActivityCard;
