import { registerTab } from '../core/tabs'
import ExpensesTab from './expenses/ExpensesTab'
import FamilyTab from './family/FamilyTab'

// Documents and Locations are placeholders; each will move into its own folder as it is built.
const comingSoon = () => <p>This tab is being built. It will appear here soon.</p>

registerTab({
  id: 'expenses', title: 'Expenses', icon: '💰', color: '#16a34a',
  blurb: 'Track spending in riyal and rupees', render: (account) => <ExpensesTab account={account} />,
})
registerTab({
  id: 'documents', title: 'Documents', icon: '📄', color: '#2563eb',
  blurb: 'Keep important papers safe', render: comingSoon,
})
registerTab({
  id: 'locations', title: 'Locations', icon: '📍', color: '#ea580c',
  blurb: 'Hospitals, markets and places you visit', render: comingSoon,
})
registerTab({
  id: 'family', title: 'Family', icon: '👨‍👩‍👧', color: '#db2777', adminOnly: true,
  blurb: 'Add people and choose what they can use', render: (account) => <FamilyTab account={account} />,
})
