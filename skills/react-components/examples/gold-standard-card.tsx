
import React from 'react';
// Note for Agent: The '@' alias refers to the target project's src directory.
// Ensure src/data/mockData.ts is created before generating this component.
import { cardData } from '../data/mockData';

/**
 * Gold Standard: ActivityCard
 * This file serves as the definitive reference for the agent.
 */
interface ActivityCardProps {
  readonly id: string;
  readonly username: string;
  readonly action: 'MERGED' | 'COMMIT';
  readonly timestamp: string;
  readonly avatarUrl: string;
  readonly repoName: string;
}

export const ActivityCard: React.FC<ActivityCardProps> = ({
  username,
  action,
  timestamp,
  avatarUrl,
  repoName,
}) => {
  const isMerged = action === 'MERGED';

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-surface-dark p-4 min-h-14 shadow-sm ring-1 ring-white/10">
      <div className="flex items-center gap-4 overflow-hidden">
        <div
          className="aspect-square h-10 w-10 flex-shrink-0 rounded-full bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${avatarUrl})` }}
          aria-label={`Avatar for ${username}`}
        />

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:text-base">
          <a href="#" className="font-semibold text-primary hover:underline truncate">
            {username}
          </a>

          <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${isMerged ? 'bg-purple-500/30 text-purple-300' : 'bg-primary/30 text-primary'
            }`}>
            {action}
          </span>

          <span className="text-white/60">in</span>

          <a href="#" className="text-primary hover:underline truncate">
            {repoName}
          </a>
        </div>
      </div>

      <div className="shrink-0">
        <p className="text-sm font-normal leading-normal text-white/50">
          {timestamp}
        </p>
      </div>
    </div>
  );
};

export default ActivityCard;