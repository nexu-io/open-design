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

// Use a valid identifier like 'StitchComponent' as the placeholder
interface StitchComponentProps {
  readonly children?: React.ReactNode;
  readonly className?: string;
}

export const StitchComponent: React.FC<StitchComponentProps> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div className={`relative ${className}`} {...props}>
      {children}
    </div>
  );
};

export default StitchComponent;