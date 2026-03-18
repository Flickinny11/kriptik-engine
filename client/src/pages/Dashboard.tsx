import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, LogOut, Plus, X } from 'lucide-react';
import { useUserStore } from '@/store/useUserStore';
import { useProjectStore } from '@/store/useProjectStore';
import { apiClient } from '@/lib/api-client';
import { ProjectCard3D } from '@/components/ui/ProjectCard3D';
import { v4 as uuid } from 'uuid';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading, logout } = useUserStore();
  const { projects, isLoading: projectsLoading, fetchProjects, addProject, removeProject } = useProjectStore();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showNewProjectWizard, setShowNewProjectWizard] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Fetch projects on mount
  useEffect(() => {
    if (isAuthenticated) fetchProjects();
  }, [isAuthenticated, fetchProjects]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const projectId = uuid();
      const name = prompt.slice(0, 50) + (prompt.length > 50 ? '...' : '');
      const { project } = await apiClient.createProject({ id: projectId, name, description: prompt });
      addProject(project);
      navigate(`/builder/${projectId}`, { state: { initialPrompt: prompt } });
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  // Flow B: Create empty project via wizard → navigate to builder with no prompt
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const projectId = uuid();
      const { project } = await apiClient.createProject({ id: projectId, name: newProjectName.trim() });
      addProject(project);
      setShowNewProjectWizard(false);
      setNewProjectName('');
      navigate(`/builder/${projectId}`); // No initialPrompt — user enters prompt in builder
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-kriptik-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-kriptik-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kriptik-black">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold text-kriptik-white">
          Krip<span className="text-kriptik-lime">Tik</span>
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-kriptik-silver">{user?.email}</span>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="text-kriptik-silver hover:text-kriptik-white transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* NLP Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <h2 className="text-3xl font-display font-bold text-kriptik-white mb-2">
            What do you want to build?
          </h2>
          <p className="text-kriptik-silver mb-6">
            Describe your app and the engine will build it.
          </p>

          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Build me an AI-powered todo app with natural language task entry..."
              rows={4}
              className="w-full bg-kriptik-charcoal border border-white/10 rounded-xl px-5 py-4 text-kriptik-white placeholder:text-kriptik-slate resize-none focus:outline-none focus:border-kriptik-lime/50 focus:ring-1 focus:ring-kriptik-lime/20 transition-all font-sans text-base"
            />
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className="absolute bottom-4 right-4 bg-kriptik-lime text-kriptik-black px-5 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 hover:bg-kriptik-lime/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Sparkles size={16} />
              {isGenerating ? 'Creating...' : 'Generate'}
            </button>
          </div>
        </motion.div>

        {/* Projects */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-display font-semibold text-kriptik-white">
              Your Projects
            </h3>
            <button
              onClick={() => setShowNewProjectWizard(true)}
              className="flex items-center gap-2 px-4 py-2 bg-kriptik-charcoal border border-white/10 rounded-lg text-sm text-kriptik-white hover:border-kriptik-lime/30 transition-all"
            >
              <Plus size={16} />
              New Project
            </button>
          </div>

          {projectsLoading ? (
            <div className="text-kriptik-silver text-sm">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
              <p className="text-kriptik-silver mb-2">No projects yet</p>
              <p className="text-kriptik-slate text-sm">Enter a prompt above to create your first app</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 pt-4">
              {projects.map((project) => (
                <ProjectCard3D
                  key={project.id}
                  projectName={project.name}
                  description={project.description || undefined}
                  status={project.status}
                  createdAt={project.createdAt}
                  onClick={() => navigate(`/builder/${project.id}`)}
                  onDelete={() => removeProject(project.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New Project Wizard Modal */}
      <AnimatePresence>
        {showNewProjectWizard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowNewProjectWizard(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-kriptik-charcoal border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-display font-semibold text-kriptik-white">New Project</h3>
                <button
                  onClick={() => setShowNewProjectWizard(false)}
                  className="text-kriptik-silver hover:text-kriptik-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-kriptik-silver mb-4">
                Name your project. You'll describe what to build in the next step.
              </p>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                placeholder="My awesome app"
                autoFocus
                className="w-full bg-kriptik-black border border-white/10 rounded-lg px-4 py-3 text-kriptik-white placeholder:text-kriptik-slate focus:outline-none focus:border-kriptik-lime/50 focus:ring-1 focus:ring-kriptik-lime/20 transition-all mb-4"
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowNewProjectWizard(false)}
                  className="px-4 py-2 text-sm text-kriptik-silver hover:text-kriptik-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim()}
                  className="px-5 py-2 bg-kriptik-lime text-kriptik-black text-sm font-semibold rounded-lg hover:bg-kriptik-lime/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

