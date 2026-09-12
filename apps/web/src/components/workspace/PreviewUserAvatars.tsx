import { UserAvatars, type AvatarUser } from '../ui/user-avatars';
import styles from './PreviewUserAvatars.module.css';

// User-approved sample people from the supplied component, pending real member data.
const PREVIEW_AVATAR_DEMO_USERS: readonly AvatarUser[] = [
  { id: 1, name: 'Alice', image: 'https://cdn.21st.dev/assets/mirror/f0/f02fed36023656a5b5df6f247c83c96c53bfa9db5b98085cdee93ffc938a5f37.jpg' },
  { id: 2, name: 'Bob', image: 'https://cdn.21st.dev/assets/mirror/5b/5b5b2f3487692d40f629010ea6448d150907f780d8c262c4ca194b7386115c2d.jpg' },
  { id: 3, name: 'Charlie', image: 'https://cdn.21st.dev/assets/mirror/10/10e2bfa5446e5c116e269b649b5f5e0106d96643f0a903048f3a056e40c35cd8.jpg' },
  { id: 4, name: 'Diana', image: 'https://cdn.21st.dev/assets/mirror/fa/fae47bb0faba45d1e0696b6557ca36c551a738c7d6e3950e82bb69dd2f963a72.jpg' },
  { id: 5, name: 'Eve', image: 'https://cdn.21st.dev/assets/mirror/4f/4fb45af36b546e069b72527fdf4d904855a2b11b301fa738c8bc4d235595c4df.jpg' },
  { id: 6, name: 'Frank', image: 'https://cdn.21st.dev/assets/mirror/a4/a4dd47498f54944edb9cd8095fb751847193faac01d922bae494e68d0cf90f4f.jpg' },
  { id: 7, name: 'Grace', image: 'https://cdn.21st.dev/assets/mirror/b2/b2cd3e4ad761fd9954c265df5f86090c4f17c388c07f78332e75edfd7420f66a.jpg' },
  { id: 8, name: 'Hank', image: 'https://cdn.21st.dev/assets/mirror/9a/9a3f3f88dac2ceb807e98d4cbe99acc9813da6d0ce2859b1cf026747727e1667.jpg' },
];

export function PreviewUserAvatars() {
  return (
    <div className={styles.root} data-testid="preview-user-avatars">
      <UserAvatars users={PREVIEW_AVATAR_DEMO_USERS} size={28} maxVisible={3} />
    </div>
  );
}
