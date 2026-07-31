import React, { useEffect, useState } from 'react';
import api from '../services/api';
import AdminHeroBanner from '../components/admin/dashboard/AdminHeroBanner';
import AdminStatsCards from '../components/admin/dashboard/AdminStatsCards';
import AdminActivityChart from '../components/admin/dashboard/AdminActivityChart';
import AdminSystemSummary from '../components/admin/dashboard/AdminSystemSummary';
import LatestCourses from '../components/admin/dashboard/LatestCourses';
import LatestExercises from '../components/admin/dashboard/LatestExercises';

export default function AdminOverview() {
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, coursesRes, exercisesRes] = await Promise.all([
          api.get('/users'),
          api.get('/courses'),
          api.get('/exercises')
        ]);
        setUsers(usersRes.data || []);
        setCourses(coursesRes.data || []);
        setExercises(exercisesRes.data || []);
      } catch (error) {
        console.error('Failed to fetch stats', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const teacherCount = users.filter((u) => u.role === 'teacher').length;

  if (loading) {
    return <div className="p-8 text-center text-admin-muted-foreground">Đang tải thông số hệ thống...</div>;
  }

  return (
    <div className="space-y-8 pb-12">
      <AdminHeroBanner />
      
      <AdminStatsCards 
        totalUsers={users.length} 
        teachers={teacherCount} 
        courses={courses.length} 
        exercises={exercises.length} 
      />

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <AdminActivityChart />
        </div>
        <div className="col-span-12 lg:col-span-4 space-y-8">
          <AdminSystemSummary />
        </div>
      </div>

      <LatestCourses courses={courses} />
      <LatestExercises exercises={exercises} />
    </div>
  );
}
