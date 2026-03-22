import { Dialog, DialogContent } from '../ui/dialog';
import { useDeploymentStore } from '../../store/useDeploymentStore';
import DeploymentConfig from './DeploymentConfig';
import DeploymentStatus from './DeploymentStatus';
import DeploymentSuccess from './DeploymentSuccess';
import { CloseInterlockIcon3D, DeployInterlockIcon3D } from '../ui/InterlockingIcons3D';
import './deploy-popout.css';

export default function DeploymentModal() {
    const { isOpen, setIsOpen, status } = useDeploymentStore();

    const getTitle = () => {
        switch (status) {
            case 'deploying': return 'Deploying Application';
            case 'success': return 'Deployment Complete';
            case 'error': return 'Deployment Failed';
            default: return 'Deploy Your App';
        }
    };

    const getSubtitle = () => {
        switch (status) {
            case 'deploying':
                return 'Streaming build output and provisioning.';
            case 'success':
                return 'Your app is live. Copy the URL or open it in a new tab.';
            case 'error':
                return 'Review the logs and retry when ready.';
            default:
                return 'Pick a target and ship with clean, production-grade defaults.';
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent
                className="sm:max-w-[720px] p-0 border-0 bg-transparent shadow-none [&>button]:hidden"
                aria-label={getTitle()}
            >
                <div className="deploy-popout">
                    <div className="deploy-popout__edge" />
                    <div className="deploy-popout__noise" />

                    <div className="deploy-popout__header">
                        <div className="deploy-popout__titlewrap">
                            <div className="flex items-center gap-2 min-w-0">
                                <DeployInterlockIcon3D size={18} tone="crimson" animate={status === 'deploying'} />
                                <div className="deploy-popout__title">{getTitle()}</div>
                            </div>
                            <div className="deploy-popout__subtitle">{getSubtitle()}</div>
                        </div>

                        <div className="deploy-popout__actions">
                            <button
                                className="deploy-popout__iconbtn"
                                onClick={() => setIsOpen(false)}
                                aria-label="Close deployment dialog"
                                type="button"
                            >
                                <CloseInterlockIcon3D size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="deploy-popout__body">
                        <div className="deploy-popout__scroll">
                            {status === 'idle' && <DeploymentConfig />}
                            {(status === 'deploying' || status === 'error') && <DeploymentStatus />}
                            {status === 'success' && <DeploymentSuccess />}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
